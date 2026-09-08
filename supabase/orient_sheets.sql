-- 오리엔시트(브리프): 브랜드가 매월 업로드 → 관리자·크리에이터 열람
-- Supabase SQL Editor에서 1회 실행.
create table if not exists orient_sheets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete cascade,
  year_month text,
  title text not null,
  description text,
  file_url text,
  file_name text,
  created_at timestamptz default now()
);
alter table orient_sheets enable row level security;

-- 읽기: 로그인한 사용자 전체 (크리에이터 전체 열람)
drop policy if exists orient_read on orient_sheets;
create policy orient_read on orient_sheets for select to authenticated using (true);

-- 관리자: 전체 쓰기
drop policy if exists orient_admin_write on orient_sheets;
create policy orient_admin_write on orient_sheets for all to authenticated using (is_admin()) with check (is_admin());

-- 브랜드: 자기 브랜드만 업로드·삭제
drop policy if exists orient_brand_write on orient_sheets;
create policy orient_brand_write on orient_sheets for all to authenticated
  using (brand_id in (select my_brand_ids())) with check (brand_id in (select my_brand_ids()));

create index if not exists orient_sheets_brand_month on orient_sheets(brand_id, year_month);
notify pgrst, 'reload schema';
