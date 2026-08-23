-- 크리에이터 계약·정산 상세 컬럼 추가 (프리랜서 마스터)
-- Supabase SQL Editor에서 1회 실행. 추가형(add if not exists)이라 안전하게 재실행 가능.

alter table creators
  add column if not exists code           text,   -- 고유번호 (CC001…)
  add column if not exists name_kanji     text,   -- 한자(일본어) 이름
  add column if not exists name_en        text,   -- 영문 이름
  add column if not exists address_en     text,   -- 영문 주소
  add column if not exists email          text,
  add column if not exists phone          text,
  add column if not exists address        text,
  add column if not exists bank_account   text,
  add column if not exists invoice_reg_no text,   -- 인보이스 등록번호 (T번호)
  add column if not exists entity_type    text,   -- 'individual' | 'corporation'
  add column if not exists withholding    boolean,-- 원천징수 대상
  add column if not exists contract_end   date,   -- 계약종료일
  add column if not exists base_fee       numeric,-- 기본보수 (세전/월)
  add column if not exists pay_cycle      text;   -- 지급사이클
