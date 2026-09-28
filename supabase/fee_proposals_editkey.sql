-- 비용 제안 수정/삭제 — 작성자 본인(편집키) 확인용
alter table public.fee_proposals add column if not exists edit_key text;
