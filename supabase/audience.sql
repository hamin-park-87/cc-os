-- 오디언스(팔로워 성별·연령) 스냅샷 — IG follower_demographics 수집분
create table if not exists public.audience_snapshots (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators(id) on delete cascade,
  date date not null,
  female_pct int,          -- 여성 비율(%) — 성별 데이터 없으면 null
  ages jsonb,              -- [["13–17",n],["18–24",n],...] 각 연령대 비율(%)
  raw jsonb,               -- 원본 breakdown (디버그/재파싱용)
  created_at timestamptz not null default now(),
  unique (creator_id, date)
);

alter table public.audience_snapshots enable row level security;
drop policy if exists aud_snap_admin on public.audience_snapshots;
create policy aud_snap_admin on public.audience_snapshots for all using (is_admin()) with check (is_admin());
drop policy if exists aud_snap_self on public.audience_snapshots;
create policy aud_snap_self on public.audience_snapshots for select using (creator_id = my_creator_id());
