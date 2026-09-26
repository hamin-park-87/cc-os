-- deal_comments.sql를 이미 실행한 경우: 편집키 컬럼만 추가
alter table public.deal_comments add column if not exists edit_key text;
