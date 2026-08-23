-- ⚠️ 데모 전용: 로그인 없이(anon) 조회만 허용해 연결을 확인하기 위한 임시 정책.
-- 실제 인증(매직링크) 전환 후에는 아래 "제거" 블록으로 반드시 삭제하세요.

create policy demo_anon_brands      on brands                    for select to anon using (true);
create policy demo_anon_creators    on creators                  for select to anon using (true);
create policy demo_anon_contents    on contents                  for select to anon using (true);
create policy demo_anon_metrics     on content_metric_snapshots  for select to anon using (true);
create policy demo_anon_contracts   on contracts                 for select to anon using (true);
create policy demo_anon_assignments on assignments               for select to anon using (true);
create policy demo_anon_deals       on deals                     for select to anon using (true);
create policy demo_anon_ig          on ig_accounts               for select to anon using (true);
create policy demo_anon_profiles    on profiles                  for select to anon using (true);

-- ── 나중에 제거할 때 (실제 인증 전환 후) ──────────────
-- drop policy demo_anon_brands      on brands;
-- drop policy demo_anon_creators    on creators;
-- drop policy demo_anon_contents    on contents;
-- drop policy demo_anon_metrics     on content_metric_snapshots;
-- drop policy demo_anon_contracts   on contracts;
-- drop policy demo_anon_assignments on assignments;
-- drop policy demo_anon_deals       on deals;
-- drop policy demo_anon_ig          on ig_accounts;
-- drop policy demo_anon_profiles    on profiles;
