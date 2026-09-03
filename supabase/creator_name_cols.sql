-- creators 누락 컬럼 보정 — 크리에이터 추가/저장 시 'address_en' 스키마 오류 해결
-- (한자이름/영문이름/영문주소 3개만 누락돼 있었음)
-- Supabase SQL Editor에서 1회 실행.
alter table creators
  add column if not exists name_kanji text,   -- 한자(일본어) 이름
  add column if not exists name_en    text,   -- 영문 이름
  add column if not exists address_en text;   -- 영문 주소
notify pgrst, 'reload schema';
