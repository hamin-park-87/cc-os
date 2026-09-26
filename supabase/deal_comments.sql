-- 안건 대시보드 협업 스레드 — 수정요청·피드백·1차완성본(초안)
create table if not exists public.deal_comments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  role text not null default 'client',   -- client(의뢰사) | creator(CC) | manager(매니저)
  author text,                            -- 표시 이름
  kind text not null default 'note',      -- note(댓글) | request(수정요청) | draft(1차완성본)
  body text,
  url text,                               -- 초안/첨부 링크
  edit_key text,                          -- 작성자 본인 수정·삭제용 키(브라우저 보관)
  created_at timestamptz not null default now()
);
alter table public.deal_comments enable row level security;
create index if not exists deal_comments_deal_idx on public.deal_comments (deal_id, created_at);

-- 내부(관리자 전체 / 크리에이터 본인 안건) 조회·작성. 의뢰사(공개)는 서버가 토큰 검증 후 service_role로 처리.
drop policy if exists deal_comments_admin on public.deal_comments;
create policy deal_comments_admin on public.deal_comments for all using (is_admin()) with check (is_admin());
drop policy if exists deal_comments_creator_read on public.deal_comments;
create policy deal_comments_creator_read on public.deal_comments for select
  using (deal_id in (select id from public.deals where creator_id = my_creator_id()));
