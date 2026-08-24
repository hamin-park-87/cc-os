-- 브랜드 인보이스 BILL TO 정보 컬럼
-- Supabase SQL Editor에서 1회 실행.
alter table brands
  add column if not exists bill_company text,
  add column if not exists bill_address text,
  add column if not exists bill_tel     text,
  add column if not exists bill_rep     text,
  add column if not exists bill_reg_no  text;
notify pgrst, 'reload schema';
