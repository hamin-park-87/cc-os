-- 초안(결과물) 컨펌 사이클 — 상태(검토대기/수정요청/승인)
-- draft 코멘트에 사용: review | revise | approved
alter table public.deal_comments add column if not exists status text;
