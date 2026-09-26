-- 대댓글(스레드형) — 특정 글에 답글을 다는 부모 참조
alter table public.deal_comments add column if not exists parent_id uuid references public.deal_comments(id) on delete cascade;
create index if not exists deal_comments_parent_idx on public.deal_comments (parent_id);
