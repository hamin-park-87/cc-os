-- CC 프로필: 세계관 항목(About Me / My Goal / My Best Works) 추가.
-- 기존 프로필 컬럼·데이터 변경 없음. best_works는 sns/rates처럼 jsonb 배열. 재실행 안전.
alter table public.creators
  add column if not exists about_me   text,
  add column if not exists my_goal    text,
  add column if not exists best_works jsonb not null default '[]';
