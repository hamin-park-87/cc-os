-- Phase A: 외부 PR 안건 공개 대시보드 — 안건별 보안 공유 토큰
alter table public.deals add column if not exists share_token text;
create unique index if not exists deals_share_token_key on public.deals (share_token) where share_token is not null;
