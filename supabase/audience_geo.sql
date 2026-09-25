-- 오디언스 국가·도시 분포 추가 (IG follower_demographics breakdown=country / city)
alter table public.audience_snapshots
  add column if not exists countries jsonb,   -- [["JP",n],["KR",n],...] 상위 국가 비율(%)
  add column if not exists cities jsonb;       -- [["Tokyo, Tokyo",n],...] 상위 도시 비율(%)
