# Zalo Chatbot Dynamic API starter (Vercel + Supabase)

## 1) Mục tiêu
Webhook này dùng cho bước **Dynamic API** trong Zalo Chatbot để:
- nhận tham số từ Zalo Chatbot
- tra cứu dữ liệu trong Supabase
- trả về đúng `Zalo Chatbot Format`

## 2) Biến môi trường trên Vercel
Thêm các biến sau trong Project Settings -> Environment Variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ZALO_WEBHOOK_SECRET`

## 3) Cấu hình URL trên Zalo Chatbot
Ví dụ URL cho bước Dynamic API:

```txt
https://your-vercel-domain.vercel.app/api/zalo/dynamic?action=lookup_admission&secret=YOUR_SECRET&user_id=((user_id))&user_name=((user_name))&oa_id=((oa_id))&student_code=((student_code))
```

> `((user_id))`, `((user_name))`, `((oa_id))` là các biến mà tài liệu Zalo có ví dụ minh hoạ. `((student_code))` là biến bạn tự lưu ở Flow trước đó.

## 4) Các file chính
- `app/api/zalo/dynamic/route.ts`: endpoint webhook
- `lib/supabaseAdmin.ts`: Supabase server client
- `supabase/schema.sql`: schema + dữ liệu mẫu

## 5) Luồng hoạt động
1. Zalo Chatbot gọi webhook ở Vercel.
2. Vercel đọc query/body.
3. Webhook kiểm tra `ZALO_WEBHOOK_SECRET`.
4. Webhook query Supabase bằng `service_role`.
5. Trả JSON theo `version: "chatbot"`.
6. Ghi log request/response vào `zalo_request_logs`.

## 6) Cài nhanh
```bash
npm install @supabase/supabase-js
```

Nếu đây là dự án Next.js mới:
```bash
npx create-next-app@latest zalo-bot-webhook
```

## 7) Lưu ý
- Không dùng `SUPABASE_SERVICE_ROLE_KEY` ở client/browser.
- Khi đổi environment variables trên Vercel, cần deploy lại để giá trị mới có hiệu lực.
- Nên giữ response ngắn gọn và tối ưu query để endpoint phản hồi dưới 2 giây.
