-- PR 안건 등록자 기록 — 누가(또는 무엇이) 이 안건을 등록했는지
-- "메일 자동등록"(AI/이메일 파이프라인) 또는 등록한 관리자 이메일
alter table public.deals add column if not exists registered_by text;

-- 기존 이메일 자동등록 안건 백필(선택): source가 company_email이고 등록자 없으면 표시
update public.deals set registered_by = '메일 자동등록'
  where registered_by is null and source = 'company_email' and code like 'MAIL-%';
