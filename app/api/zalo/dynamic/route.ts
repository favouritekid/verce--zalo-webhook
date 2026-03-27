import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export const runtime = 'nodejs'
export const maxDuration = 3

const FALLBACK_TEXT =
  'Xin lỗi, hệ thống đang bận. Bạn vui lòng thử lại sau ít phút nhé.'

type ChatbotButton = {
  name: string
  type: 'url' | 'phone' | 'query'
  url?: string
  payload?: string
}

type ChatbotMessage =
  | {
      type: 'text'
      text: string
      buttons?: ChatbotButton[]
    }
  | {
      type: 'image'
      image_url: string
      caption?: string
    }
  | {
      type: 'list'
      elements: Array<{
        title: string
        subtitle?: string
        image_url?: string
        action?: {
          type: 'url'
          url: string
        }
      }>
    }

type ChatbotResponse = {
  version: 'chatbot'
  content: {
    messages: ChatbotMessage[]
  }
}

function chatbotResponse(messages: ChatbotMessage[]): ChatbotResponse {
  return {
    version: 'chatbot',
    content: {
      messages: messages.slice(0, 5),
    },
  }
}

function textResponse(text: string, buttons?: ChatbotButton[]) {
  return NextResponse.json(chatbotResponse([{ type: 'text', text, ...(buttons?.length ? { buttons } : {}) }]), {
    status: 200,
  })
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return null
}

function normalizePhone(input: string | null): string | null {
  if (!input) return null
  const digits = input.replace(/\D/g, '')
  if (!digits) return null

  if (digits.startsWith('84')) return `0${digits.slice(2)}`
  if (digits.startsWith('0')) return digits
  return digits
}

async function readBody(request: Request) {
  if (request.method === 'GET') return {}

  const contentType = request.headers.get('content-type') || ''
  try {
    if (contentType.includes('application/json')) {
      return await request.json()
    }

    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      return Object.fromEntries(formData.entries())
    }
  } catch {
    return {}
  }

  return {}
}

async function writeLog(payload: {
  action: string | null
  zalo_user_id: string | null
  oa_id: string | null
  request_payload: Record<string, unknown>
  response_payload: ChatbotResponse
  latency_ms: number
}) {
  try {
    await getSupabaseAdmin().from('zalo_request_logs').insert(payload)
  } catch {
    // Không chặn luồng trả tin nhắn vì lỗi log.
  }
}

async function saveContact(args: {
  userId: string | null
  displayName: string | null
  oaId: string | null
  phone: string | null
  nganh: string | null
  dob: string | null
  address: string | null
  avatar: string | null
  isFollower: string | null
}) {
  const { userId, displayName, oaId, phone, nganh, dob, address, avatar, isFollower } = args
  if (!userId) return

  try {
    await getSupabaseAdmin().from('zalo_contacts').upsert(
      {
        zalo_user_id: userId,
        oa_id: oaId,
        full_name: displayName,
        phone,
        nganh,
        dob,
        address,
        avatar,
        is_follower: isFollower === 'true' || isFollower === '1',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'zalo_user_id' },
    )
  } catch {
    // Không chặn luồng chính
  }
}

// === ACTION: find — Tra cứu thông tin ngành nghề ===
async function handleFindProgram(args: {
  userId: string | null
  displayName: string | null
  oaId: string | null
  phone: string | null
  nganh: string | null
  hoTen: string | null
  dob: string | null
  address: string | null
  avatar: string | null
  isFollower: string | null
  rawRequest: Record<string, unknown>
  startedAt: number
}) {
  const { userId, displayName, oaId, phone, nganh, rawRequest, startedAt } = args

  // Lưu thông tin contact
  await saveContact(args)

  if (!nganh) {
    return textResponse(
      `Chào ${displayName || 'bạn'}, bạn chưa chọn ngành nghề. Vui lòng chọn một ngành để mình tra cứu thông tin nhé.`,
    )
  }

  // Tìm ngành theo tên (ilike để không phân biệt hoa/thường)
  const { data, error } = await getSupabaseAdmin()
    .from('programs')
    .select('*')
    .ilike('name', `%${nganh}%`)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    const responsePayload = chatbotResponse([
      {
        type: 'text',
        text: `Mình chưa tìm thấy thông tin ngành "${nganh}". Bạn vui lòng thử chọn lại hoặc liên hệ tư vấn nhé.`,
        buttons: [
          { name: 'Gọi tư vấn', type: 'phone', payload: '02623812345' },
        ],
      },
    ])

    await writeLog({
      action: 'find',
      zalo_user_id: userId,
      oa_id: oaId,
      request_payload: rawRequest,
      response_payload: responsePayload,
      latency_ms: Date.now() - startedAt,
    })

    return NextResponse.json(responsePayload, { status: 200 })
  }

  const lines = [
    `Tên ngành: ${data.name}`,
    `Mã ngành: ${data.code || 'Đang cập nhật'}`,
    `Trình độ: ${data.level || 'Cao đẳng'}`,
    `Thời gian đào tạo: ${data.duration || 'Đang cập nhật'}`,
    `Phương thức xét tuyển: ${data.admission_methods || 'Đang cập nhật'}`,
    `Học phí: ${data.tuition || 'Đang cập nhật'}`,
  ]

  const buttons: ChatbotButton[] = []
  if (data.detail_url) {
    buttons.push({ name: 'Xem chi tiết', type: 'url', url: data.detail_url })
  }
  buttons.push({ name: 'Gọi tư vấn', type: 'phone', payload: '02623812345' })

  const responsePayload = chatbotResponse([
    { type: 'text', text: lines.join('\n'), buttons },
  ])

  await writeLog({
    action: 'find',
    zalo_user_id: userId,
    oa_id: oaId,
    request_payload: rawRequest,
    response_payload: responsePayload,
    latency_ms: Date.now() - startedAt,
  })

  return NextResponse.json(responsePayload, { status: 200 })
}

// === ACTION: lookup_admission — Tra cứu hồ sơ tuyển sinh ===
async function handleLookupAdmission(args: {
  userId: string | null
  displayName: string | null
  oaId: string | null
  studentCode: string | null
  phone: string | null
  rawRequest: Record<string, unknown>
  startedAt: number
}) {
  const { userId, displayName, oaId, studentCode, phone, rawRequest, startedAt } = args

  let query = getSupabaseAdmin()
    .from('admission_records')
    .select('student_code, full_name, phone, major, status, next_step, updated_at')
    .limit(1)

  if (studentCode) {
    query = query.eq('student_code', studentCode)
  } else if (phone) {
    query = query.eq('phone', phone)
  } else if (userId) {
    query = query.eq('zalo_user_id', userId)
  } else {
    return textResponse(
      `Chào ${displayName || 'bạn'}, mình chưa có dữ liệu để tra cứu. Bạn hãy gửi mã hồ sơ hoặc số điện thoại nhé.`,
      [{ name: 'Liên hệ tư vấn', type: 'phone', payload: '02623812345' }],
    )
  }

  const { data, error } = await query.maybeSingle()

  if (error || !data) {
    const responsePayload = chatbotResponse([
      {
        type: 'text',
        text: `Mình chưa tìm thấy hồ sơ phù hợp. Bạn vui lòng kiểm tra lại mã hồ sơ hoặc số điện thoại nhé.`,
        buttons: [
          { name: 'Nhập lại mã hồ sơ', type: 'query', payload: 'Tra cứu hồ sơ' },
          { name: 'Liên hệ tư vấn', type: 'phone', payload: '02623812345' },
        ],
      },
    ])

    await writeLog({
      action: 'lookup_admission',
      zalo_user_id: userId,
      oa_id: oaId,
      request_payload: rawRequest,
      response_payload: responsePayload,
      latency_ms: Date.now() - startedAt,
    })

    return NextResponse.json(responsePayload, { status: 200 })
  }

  const responsePayload = chatbotResponse([
    {
      type: 'text',
      text: [
        `Kết quả tra cứu hồ sơ`,
        `• Mã hồ sơ: ${data.student_code}`,
        `• Họ tên: ${data.full_name}`,
        `• Ngành đăng ký: ${data.major || 'Chưa cập nhật'}`,
        `• Trạng thái: ${data.status}`,
        `• Bước tiếp theo: ${data.next_step || 'Nhà trường sẽ liên hệ thêm'}`,
        `• Cập nhật lúc: ${new Date(data.updated_at).toLocaleString('vi-VN')}`,
      ].join('\n'),
      buttons: [
        { name: 'Gọi tư vấn', type: 'phone', payload: '02623812345' },
      ],
    },
  ])

  await writeLog({
    action: 'lookup_admission',
    zalo_user_id: userId,
    oa_id: oaId,
    request_payload: rawRequest,
    response_payload: responsePayload,
    latency_ms: Date.now() - startedAt,
  })

  return NextResponse.json(responsePayload, { status: 200 })
}

// === MAIN HANDLER ===
async function handleRequest(request: Request) {
  const startedAt = Date.now()
  const body = (await readBody(request)) as Record<string, unknown>
  const url = new URL(request.url)
  const params = url.searchParams

  const providedSecret =
    pickString(
      params.get('secret'),
      request.headers.get('x-zalo-webhook-secret'),
      body.secret,
      body.webhook_secret,
    ) || ''

  if (!process.env.ZALO_WEBHOOK_SECRET || providedSecret !== process.env.ZALO_WEBHOOK_SECRET) {
    return textResponse('Webhook chưa được cấu hình đúng. Vui lòng liên hệ quản trị viên.')
  }

  const action = pickString(params.get('action'), body.action) || 'lookup_admission'
  const userId = pickString(params.get('user_id'), body.user_id, body.zaloUserID)
  const userName = pickString(params.get('user_name'), body.user_name, body.zaloName)
  const oaId = pickString(params.get('oa_id'), body.oa_id)
  const hoTen = pickString(params.get('hoTen'), body.hoTen)
  const displayName = hoTen || userName
  const studentCode = pickString(
    params.get('student_code'),
    body.student_code,
    body.content,
  )
  const phone = normalizePhone(pickString(params.get('phone'), body.phone))
  const nganh = pickString(params.get('nganh'), body.nganh)
  const dob = pickString(body.dob)
  const address = pickString(body.address)
  const avatar = pickString(body.avartar)
  const isFollower = pickString(body.isFollower)

  const rawRequest = {
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    query: Object.fromEntries(params.entries()),
    body,
  }

  try {
    switch (action) {
      case 'find':
        return await handleFindProgram({
          userId, displayName, oaId, phone, nganh, hoTen,
          dob, address, avatar, isFollower,
          rawRequest, startedAt,
        })
      case 'lookup_admission':
        return await handleLookupAdmission({
          userId, displayName, oaId, studentCode, phone,
          rawRequest, startedAt,
        })
      default:
        return textResponse(`Action "${action}" chưa được hỗ trợ.`)
    }
  } catch {
    const responsePayload = chatbotResponse([{ type: 'text', text: FALLBACK_TEXT }])

    await writeLog({
      action,
      zalo_user_id: userId,
      oa_id: oaId,
      request_payload: rawRequest,
      response_payload: responsePayload,
      latency_ms: Date.now() - startedAt,
    })

    return NextResponse.json(responsePayload, { status: 200 })
  }
}

export async function GET(request: Request) {
  return handleRequest(request)
}

export async function POST(request: Request) {
  return handleRequest(request)
}
