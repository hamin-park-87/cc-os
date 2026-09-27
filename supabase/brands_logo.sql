-- 브랜드 로고(아이콘) 이미지 URL
alter table public.brands add column if not exists logo_url text;
