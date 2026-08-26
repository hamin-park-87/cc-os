-- PR 안건(deals)에도 제작 일정(기획/촬영/편집/업로드)을 붙이기 위한 컬럼
-- Supabase SQL Editor에서 1회 실행.
alter table deals add column if not exists sched jsonb default '{}'::jsonb;
notify pgrst, 'reload schema';
