-- 브랜드 관리 확장: 고유번호·계약정보 컬럼 + 월별 PR 상품 테이블
-- Supabase SQL Editor에서 1회 실행 (추가형이라 재실행 안전)

-- 1) brands 컬럼 추가
alter table brands
  add column if not exists code            text,    -- 고유번호 (BR001…)
  add column if not exists contract_start  text,    -- 계약 시작월 (YYYY-MM)
  add column if not exists contract_end    text,    -- 계약 종료월 (YYYY-MM)
  add column if not exists monthly_quota   integer, -- 월 콘텐츠 계약 수량
  add column if not exists monthly_amount  numeric; -- 월간 계약 금액 (¥)

-- 2) 월별 브랜드 PR 상품 테이블
create table if not exists brand_products (
  id          uuid primary key default gen_random_uuid(),
  brand_id    uuid not null references brands on delete cascade,
  year_month  text not null,          -- YYYY-MM
  name        text not null,
  url         text,
  created_at  timestamptz not null default now()
);
create index if not exists brand_products_brand_month on brand_products (brand_id, year_month);

-- 3) RLS: 관리자 전체 / 브랜드 담당자는 자기 브랜드만 조회
alter table brand_products enable row level security;
drop policy if exists bp_admin on brand_products;
drop policy if exists bp_brand on brand_products;
create policy bp_admin on brand_products for all using (is_admin()) with check (is_admin());
create policy bp_brand  on brand_products for select using (brand_id in (select my_brand_ids()));

-- 4) 상품별 크리에이터 배정 (상품 × 크리에이터 → 콘텐츠 수량)
create table if not exists product_assignments (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references brand_products on delete cascade,
  creator_id  uuid not null references creators on delete cascade,
  qty         integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (product_id, creator_id)
);
alter table product_assignments enable row level security;
drop policy if exists pa_admin on product_assignments;
drop policy if exists pa_creator on product_assignments;
create policy pa_admin   on product_assignments for all using (is_admin()) with check (is_admin());
create policy pa_creator on product_assignments for select using (creator_id = my_creator_id());

notify pgrst, 'reload schema';
