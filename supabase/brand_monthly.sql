-- 브랜드 월별 계약: contracts에 월 계약금액 컬럼 추가 (수량 quota는 기존)
-- Supabase SQL Editor에서 1회 실행.
alter table contracts add column if not exists monthly_amount numeric;
-- 브랜드+월 유니크 (upsert용) — 이미 있으면 무시
create unique index if not exists contracts_brand_month on contracts (brand_id, year_month);
notify pgrst, 'reload schema';
