-- Instagram 실연동 준비: 계정 스냅샷 유니크 인덱스 (동기화 upsert용)
-- Supabase SQL Editor에서 1회 실행.
create unique index if not exists cas_creator_date on creator_account_snapshots (creator_id, date);
alter table ig_accounts add column if not exists last_synced_at timestamptz;  -- 마지막 동기화 시각
notify pgrst, 'reload schema';

-- 환경변수는 코드가 아니라 Vercel에 설정:
--   IG_APP_ID           = Instagram 앱 ID (Meta 앱 → Instagram 설정)
--   IG_APP_SECRET       = Instagram 앱 시크릿 (서버 전용)
--   NEXT_PUBLIC_APP_URL = https://cc-os.81degree.com
