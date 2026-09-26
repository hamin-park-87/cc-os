-- 대시보드 청구/입금 관리
-- invoice_*: 우리(81degree)가 올리는 청구서
-- paid_*: 의뢰사가 입금 후 남기는 입금일 + 송금확인증
alter table public.deals add column if not exists invoice_url text;
alter table public.deals add column if not exists invoice_name text;
alter table public.deals add column if not exists invoice_at timestamptz;
alter table public.deals add column if not exists paid_on date;
alter table public.deals add column if not exists remittance_url text;
alter table public.deals add column if not exists remittance_name text;
alter table public.deals add column if not exists remittance_at timestamptz;
-- 우리(81degree)측 최종 입금 확인(통장 확인) → 프로젝트 마무리
alter table public.deals add column if not exists payment_confirmed boolean not null default false;
alter table public.deals add column if not exists payment_confirmed_at timestamptz;
alter table public.deals add column if not exists payment_confirmed_by text;
