-- 콘텐츠 샘플(제품) 수령 여부 — 크리에이터가 이번 달 할일에서 체크
-- Supabase SQL Editor에서 1회 실행.
alter table contents add column if not exists sample_received boolean default false;
notify pgrst, 'reload schema';
