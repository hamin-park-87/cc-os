-- 크리에이터 휴면(dormant) — 계약 종료 크리에이터를 삭제하지 않고 보관.
-- 기존 status(활동중/계약준비/보류)와 독립된 플래그. 기존 크리에이터는 전부 활성(dormant=false) 유지.
-- 데이터 삭제·변경 없음. 재실행 안전.
alter table public.creators add column if not exists dormant boolean not null default false;
alter table public.creators add column if not exists dormant_at timestamptz;  -- 휴면 처리일
