-- 크리에이터 세계관 프로필 — About Me / My Goal / My Best Works.
-- 기존 creators 테이블에 컬럼만 추가(기존 컬럼·데이터·RLS 변경 없음). 재실행 안전.
--   about_me   : 마크다운 원문(text)
--   my_goal    : 마크다운 원문(text)
--   best_works : [{ "url": "", "views": "99만 재생", "likes": "", "memo": "" }, ...] 순서 = 배열 순서
alter table public.creators add column if not exists about_me text;
alter table public.creators add column if not exists my_goal text;
alter table public.creators add column if not exists best_works jsonb not null default '[]'::jsonb;
