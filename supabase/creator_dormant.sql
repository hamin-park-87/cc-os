-- creators 휴면 처리 — 계약 종료 크리에이터를 삭제하지 않고 보관(연동 데이터 보존)
-- 기존 행은 모두 dormant=false(활성) 유지. 데이터 삭제·변경 없음.
-- Supabase SQL Editor에서 1회 실행.
alter table creators
  add column if not exists dormant    boolean not null default false,  -- 휴면 여부 (false=활성, true=휴면)
  add column if not exists dormant_at timestamptz;                     -- 휴면 처리일
notify pgrst, 'reload schema';
