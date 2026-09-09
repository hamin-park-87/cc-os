-- CC 피드백: 크리에이터×월별 피드백 메모 — REQ-005
-- Supabase SQL Editor에서 1회 실행.
create table if not exists creator_feedback (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references creators(id) on delete cascade,
  year_month text,
  body text,
  updated_at timestamptz default now(),
  unique (creator_id, year_month)
);
alter table creator_feedback enable row level security;

drop policy if exists cfb_admin on creator_feedback;
create policy cfb_admin on creator_feedback for all to authenticated using (is_admin()) with check (is_admin());

-- 크리에이터 본인은 자기 피드백 열람
drop policy if exists cfb_creator_read on creator_feedback;
create policy cfb_creator_read on creator_feedback for select to authenticated using (creator_id = my_creator_id());

notify pgrst, 'reload schema';
