-- 의뢰사(클라이언트) 관리 — PR 안건을 의뢰하는 대행사/브랜드사 정보 마스터
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,               -- 의뢰사(회사)명
  contact_person text,              -- 담당자명
  email text,                       -- 담당자 이메일
  phone text,                       -- 연락처
  domain text,                      -- 이메일 도메인 (자동 매칭용)
  address text,                     -- 주소
  memo text,                        -- 메모
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clients enable row level security;

-- 관리자만 조회·생성·수정·삭제
drop policy if exists clients_admin_all on public.clients;
create policy clients_admin_all on public.clients
  for all using (is_admin()) with check (is_admin());

create index if not exists clients_name_idx on public.clients (name);
