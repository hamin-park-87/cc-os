-- IG 토큰 만료 재연동 안내 발송 시각(재발송 방지용). 재실행 안전.
alter table public.ig_accounts add column if not exists reconnect_notified_at timestamptz;
