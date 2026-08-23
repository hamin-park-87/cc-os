-- 81'DEGREE creator-os · 0003 RLS
-- 원칙: 데이터 격리를 DB에서 강제. 클라이언트 필터 금지.
-- 역할·소속 = profiles / brand_members / creators.user_id

-- ── 헬퍼 ──────────────────────────────────────────
create or replace function my_role() returns app_role
  language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles where id = auth.uid() and role = 'admin')
$$;

create or replace function my_brand_ids() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select brand_id from brand_members where user_id = auth.uid()
$$;

create or replace function my_creator_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from creators where user_id = auth.uid() limit 1
$$;

-- ── RLS 활성화 ────────────────────────────────────
alter table profiles enable row level security;
alter table brands enable row level security;
alter table brand_members enable row level security;
alter table creators enable row level security;
alter table contracts enable row level security;
alter table assignments enable row level security;
alter table contents enable row level security;
alter table content_metric_snapshots enable row level security;
alter table ig_accounts enable row level security;
alter table creator_account_snapshots enable row level security;
alter table creator_audience_snapshots enable row level security;
alter table secondary_usage_requests enable row level security;
alter table deals enable row level security;
alter table audit_logs enable row level security;

-- profiles: 본인 조회 / admin 전체
create policy profiles_self on profiles for select using (id = auth.uid() or is_admin());
create policy profiles_admin_all on profiles for all using (is_admin()) with check (is_admin());

-- brands: admin 전체 / brand 자기 소속 조회 / creator 자기 담당 브랜드 조회(디렉토리는 앱에서)
create policy brands_admin on brands for all using (is_admin()) with check (is_admin());
create policy brands_member_read on brands for select using (id in (select my_brand_ids()));

-- brand_members
create policy bm_admin on brand_members for all using (is_admin()) with check (is_admin());
create policy bm_self on brand_members for select using (user_id = auth.uid());

-- creators: admin 전체 / creator 본인 / brand 는 소속 크리에이터 디렉토리 조회 허용(활동중)
create policy creators_admin on creators for all using (is_admin()) with check (is_admin());
create policy creators_self on creators for select using (user_id = auth.uid());
create policy creators_brand_directory on creators for select
  using (my_role() = 'brand' and status = 'active');

-- contracts / assignments: admin 전체 / brand 자기 브랜드 / creator 본인 배정
create policy contracts_admin on contracts for all using (is_admin()) with check (is_admin());
create policy contracts_brand on contracts for select using (brand_id in (select my_brand_ids()));

create policy assignments_admin on assignments for all using (is_admin()) with check (is_admin());
create policy assignments_brand on assignments for select using (brand_id in (select my_brand_ids()));
create policy assignments_creator on assignments for select using (creator_id = my_creator_id());

-- contents: admin 전체 / brand 자기 브랜드 콘텐츠 / creator 본인 콘텐츠
create policy contents_admin on contents for all using (is_admin()) with check (is_admin());
create policy contents_brand on contents for select using (brand_id in (select my_brand_ids()));
create policy contents_creator on contents for select using (creator_id = my_creator_id());

-- 메트릭 스냅샷: 소유 콘텐츠 따라감
create policy metrics_admin on content_metric_snapshots for all using (is_admin()) with check (is_admin());
create policy metrics_brand on content_metric_snapshots for select using (
  content_id in (select id from contents where brand_id in (select my_brand_ids())));
create policy metrics_creator on content_metric_snapshots for select using (
  content_id in (select id from contents where creator_id = my_creator_id()));

-- 계정/오디언스 스냅샷: 개인 데이터 → 본인 + admin만 (브랜드 비공개, [미결 E])
create policy acct_snap_admin on creator_account_snapshots for all using (is_admin()) with check (is_admin());
create policy acct_snap_self on creator_account_snapshots for select using (creator_id = my_creator_id());
create policy aud_snap_admin on creator_audience_snapshots for all using (is_admin()) with check (is_admin());
create policy aud_snap_self on creator_audience_snapshots for select using (creator_id = my_creator_id());

-- ig_accounts: 토큰 보호 → 본인 + admin. 실제 토큰 조회는 서비스롤 전용.
create policy ig_admin on ig_accounts for all using (is_admin()) with check (is_admin());
create policy ig_self on ig_accounts for select using (creator_id = my_creator_id());

-- 2차 활용: admin 전체 / brand 자기 브랜드 / creator 본인 관련
create policy sec_admin on secondary_usage_requests for all using (is_admin()) with check (is_admin());
create policy sec_brand on secondary_usage_requests for select using (brand_id in (select my_brand_ids()));
create policy sec_brand_write on secondary_usage_requests for insert with check (brand_id in (select my_brand_ids()));
create policy sec_creator on secondary_usage_requests for select using (
  content_id in (select id from contents where creator_id = my_creator_id()));

-- deals: admin 전체 / creator 본인 안건 조회
create policy deals_admin on deals for all using (is_admin()) with check (is_admin());
create policy deals_creator on deals for select using (creator_id = my_creator_id());

-- audit_logs: admin 전용
create policy audit_admin on audit_logs for all using (is_admin()) with check (is_admin());

-- 크리에이터 동의 없이 2차활용 approved 금지 (트리거)
create or replace function enforce_secondary_consent() returns trigger
  language plpgsql as $$
begin
  if new.status = 'approved' and new.creator_consented_at is null then
    raise exception '크리에이터 동의(creator_consented_at) 없이는 승인할 수 없습니다';
  end if;
  return new;
end $$;
create trigger trg_secondary_consent before insert or update on secondary_usage_requests
  for each row execute function enforce_secondary_consent();
