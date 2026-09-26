-- 비용 협의 (대시보드) — CC/매니저가 희망 금액 제안, 의뢰사가 OK하면 합의 확정
create table if not exists public.fee_proposals (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  by text not null,             -- creator | manager | client
  author text,
  amount bigint not null,       -- 엔(¥)
  note text,
  status text not null default 'proposed',  -- proposed | agreed | withdrawn
  created_at timestamptz not null default now()
);
alter table public.fee_proposals enable row level security;
create index if not exists fee_proposals_deal_idx on public.fee_proposals (deal_id, created_at);
drop policy if exists fee_proposals_admin on public.fee_proposals;
create policy fee_proposals_admin on public.fee_proposals for all using (is_admin()) with check (is_admin());
drop policy if exists fee_proposals_creator on public.fee_proposals;
create policy fee_proposals_creator on public.fee_proposals for select
  using (deal_id in (select id from public.deals where creator_id = my_creator_id()));

-- 합의 확정 여부
alter table public.deals add column if not exists fee_agreed boolean not null default false;
