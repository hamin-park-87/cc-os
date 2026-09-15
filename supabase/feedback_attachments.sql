-- REQ-010: CC 피드백에 인사이트 캡쳐 등 이미지 첨부 저장
alter table public.creator_feedback add column if not exists attachments jsonb not null default '[]'::jsonb;
