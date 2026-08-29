-- 2차 활용: 협력광고 코드 컬럼 (전략 브랜드 영상 광고 운영 시 관리자가 입력)
-- Supabase SQL Editor에서 1회 실행.
alter table secondary_usage_requests add column if not exists ad_code text;
notify pgrst, 'reload schema';
