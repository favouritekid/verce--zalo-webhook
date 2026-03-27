create extension if not exists pgcrypto;

create table if not exists public.zalo_contacts (
  id uuid primary key default gen_random_uuid(),
  zalo_user_id text not null unique,
  oa_id text,
  full_name text,
  phone text,
  nganh text,
  dob text,
  address text,
  avatar text,
  is_follower boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admission_records (
  id uuid primary key default gen_random_uuid(),
  student_code text not null unique,
  full_name text not null,
  phone text,
  major text,
  status text not null,
  next_step text,
  zalo_user_id text,
  note text,
  updated_at timestamptz not null default now()
);

create index if not exists admission_records_phone_idx
  on public.admission_records (phone);

create index if not exists admission_records_zalo_user_id_idx
  on public.admission_records (zalo_user_id);

create table if not exists public.zalo_request_logs (
  id bigint generated always as identity primary key,
  action text,
  zalo_user_id text,
  oa_id text,
  request_payload jsonb not null,
  response_payload jsonb not null,
  latency_ms integer,
  created_at timestamptz not null default now()
);

alter table public.zalo_contacts enable row level security;
alter table public.admission_records enable row level security;
alter table public.zalo_request_logs enable row level security;

-- Nếu chỉ cho phép truy cập qua service_role ở server, có thể chặn toàn bộ truy cập trực tiếp.
do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'zalo_contacts' and policyname = 'deny_all_zalo_contacts'
  ) then
    create policy deny_all_zalo_contacts on public.zalo_contacts for all using (false) with check (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'admission_records' and policyname = 'deny_all_admission_records'
  ) then
    create policy deny_all_admission_records on public.admission_records for all using (false) with check (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'zalo_request_logs' and policyname = 'deny_all_zalo_request_logs'
  ) then
    create policy deny_all_zalo_request_logs on public.zalo_request_logs for all using (false) with check (false);
  end if;
end $$;

insert into public.admission_records (student_code, full_name, phone, major, status, next_step, zalo_user_id)
values
  ('HS2026001', 'Nguyễn Văn A', '0912345678', 'Công nghệ thông tin', 'Đã tiếp nhận hồ sơ', 'Chờ xác nhận lịch nhập học', null),
  ('HS2026002', 'Trần Thị B', '0988888888', 'Dược', 'Thiếu giấy tờ', 'Bổ sung học bạ bản sao', null)
on conflict (student_code) do nothing;
