-- PR Inbox 웹훅(Instagram DM) 중복 수신 방지 — 메시지 ID(mid) 유니크.
-- 재실행 안전. (pr_inbox.sql 실행 후 적용)
alter table public.pr_inbox_messages add column if not exists mid text;
create unique index if not exists pr_inbox_messages_mid_uidx
  on public.pr_inbox_messages(mid) where mid is not null;
