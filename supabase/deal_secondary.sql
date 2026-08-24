-- PR 안건 2차 활용 비용 컬럼
-- Supabase SQL Editor에서 1회 실행 (추가형이라 안전)
alter table deals add column if not exists secondary_fee numeric;
notify pgrst, 'reload schema';
