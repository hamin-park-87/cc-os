-- 샘플 수령 배송정보 (택배사·송장번호) — REQ-004
-- Supabase SQL Editor에서 1회 실행.
alter table contents add column if not exists sample_courier text;
alter table contents add column if not exists sample_tracking text;
notify pgrst, 'reload schema';
