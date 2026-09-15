-- REQ-008: 외부 PR 금액에 소비세(消費税) 기입란 추가
alter table public.deals add column if not exists tax numeric;
