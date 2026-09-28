-- Slack Events 중복 처리 방지(재시도 대비). event_id 유일.
create table if not exists public.slack_events (
  event_id text primary key,
  at timestamptz not null default now()
);
