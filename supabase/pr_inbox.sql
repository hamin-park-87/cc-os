-- ah!channel PR Inbox Agent — 인바운드 DM 협업 제안 수집·분류·추출·스코어링
-- 원문은 pr_inbox_messages, 분석/채점 결과는 pr_inbox_proposals.
-- 모두 `if not exists` 기반(재실행 안전). 서버 라우트는 service_role로 접근.

-- 1) 수신 DM 원문 ------------------------------------------------------------
create table if not exists public.pr_inbox_messages (
  id            uuid primary key default gen_random_uuid(),
  ig_account    text,                               -- 수신 계정(@ah___channel) ig_user_id/핸들
  thread_id     text,                               -- IG 대화 스레드 id
  sender_id     text,                               -- 보낸 사람 IG user id
  sender_handle text,
  text_original text,                               -- 일본어 원문
  attachments   jsonb       not null default '[]',  -- [{type,url}]
  raw           jsonb,                              -- 웹훅/백필 원본
  source        text        not null default 'webhook', -- webhook | backfill | manual
  received_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists pr_inbox_messages_thread_idx   on public.pr_inbox_messages(thread_id);
create index if not exists pr_inbox_messages_received_idx  on public.pr_inbox_messages(received_at desc);

-- 2) 추출·스코어링 결과 ------------------------------------------------------
create table if not exists public.pr_inbox_proposals (
  id            uuid primary key default gen_random_uuid(),
  pr_id         text unique,                        -- 표시용 PR-261015-003
  thread_id     text,
  message_id    uuid references public.pr_inbox_messages(id) on delete set null,

  -- 분류
  category      text,                               -- ad_pr|seeding|event|casting|application|fan|spam
  proposal_type text,                               -- T1|T2|T3

  -- 누가
  brand_name    text,
  brand_id      uuid,                               -- cc-os brands 매칭 시(소프트 링크)
  org_type      text,                               -- brand|agency
  contact_name  text,
  contact_email text,
  brand_country text,                               -- KR|JP|ETC
  official      boolean,

  -- 무엇을 / 조건
  industry         text,                            -- beauty|fashion|food|travel|telco...
  deliverables     text,                            -- 릴스 n편·스토리 등
  product_offer    boolean,
  budget_mentioned boolean,
  budget_amount    numeric,
  schedule         text,

  -- 기록
  ko_summary    text,                               -- 한국어 3줄 요약
  missing       text[]      not null default '{}',  -- "확인 필요" 항목

  -- 스코어링
  score         int,
  grade         text,                               -- A|B|C|X
  flags         jsonb       not null default '[]',  -- 리스크 플래그(이해상충 등)
  score_detail  jsonb,                              -- 항목별 점수(오디언스/수익성/...)
  score_history jsonb       not null default '[]',  -- 가중치 보정용 이력

  -- 운영
  status        text        not null default 'new', -- new|reviewing|negotiating|won|rejected|archived
  assignee      text,
  replied_at    timestamptz,

  extracted_at  timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists pr_inbox_proposals_grade_idx  on public.pr_inbox_proposals(grade);
create index if not exists pr_inbox_proposals_status_idx on public.pr_inbox_proposals(status);
create index if not exists pr_inbox_proposals_thread_idx on public.pr_inbox_proposals(thread_id);

-- 3) RLS — 관리자만 조회(서버 라우트는 service_role로 우회) ------------------
alter table public.pr_inbox_messages  enable row level security;
alter table public.pr_inbox_proposals enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='pr_inbox_messages' and policyname='pr_inbox_messages_admin') then
    create policy pr_inbox_messages_admin on public.pr_inbox_messages
      for all using (public.is_admin()) with check (public.is_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename='pr_inbox_proposals' and policyname='pr_inbox_proposals_admin') then
    create policy pr_inbox_proposals_admin on public.pr_inbox_proposals
      for all using (public.is_admin()) with check (public.is_admin());
  end if;
end $$;
