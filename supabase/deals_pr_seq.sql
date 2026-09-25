-- REQ-022: 외부 PR 구분번호를 영구 번호(pr_seq)로 — 삭제해도 결번 유지, 재사용 없음
alter table public.deals add column if not exists pr_seq int;
-- 중복 방지 (동시 생성 시 안전장치)
create unique index if not exists deals_pr_seq_key on public.deals (pr_seq) where pr_seq is not null;
