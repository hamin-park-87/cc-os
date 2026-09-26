-- 진행 단계 이벤트(각 단계 도달 일자 기록)
create table if not exists public.deal_step_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  step int not null,
  at timestamptz not null default now()
);
alter table public.deal_step_events enable row level security;
create index if not exists deal_step_events_idx on public.deal_step_events (deal_id, step);
drop policy if exists deal_step_events_admin on public.deal_step_events;
create policy deal_step_events_admin on public.deal_step_events for all using (is_admin()) with check (is_admin());
drop policy if exists deal_step_events_creator on public.deal_step_events;
create policy deal_step_events_creator on public.deal_step_events for select
  using (deal_id in (select id from public.deals where creator_id = my_creator_id()));

-- CC별 소통 슬랙 채널 (대시보드 알림 라우팅용)
alter table public.creators add column if not exists slack_channel text;
