-- 콘텐츠 귀속 월(year_month) — 계획 콘텐츠가 어느 달 물량인지 고정
-- (없으면 날짜 미정 콘텐츠가 모든 달에 노출되는 버그 발생)
-- Supabase SQL Editor에서 1회 실행.
alter table contents add column if not exists year_month text;

-- 기존 계획 콘텐츠(날짜 미정 PR 계획)를 8월 물량으로 backfill
update contents set year_month = '2026-08'
 where kind = 'pr' and status = 'planned' and year_month is null;

notify pgrst, 'reload schema';
