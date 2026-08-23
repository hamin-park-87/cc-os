-- 81'DEGREE creator-os · 전체 설정 (리셋 포함 · 한 번에 실행)

-- ⚠️ 리셋: public 스키마를 비우고 처음부터 재생성 (재실행 안전)
drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
grant all on all routines in schema public to postgres, anon, authenticated, service_role;
grant all on all sequences in schema public to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on routines to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to postgres, anon, authenticated, service_role;

-- 81'DEGREE creator-os · 0001 enums
-- 실행 순서: 0001 → 0002 → 0003 → seed.sql

create type app_role         as enum ('admin','brand','creator');
create type account_status   as enum ('pending','active','disabled');
create type creator_status   as enum ('active','preparing','on_hold');          -- 활동중/계약준비/보류
create type contract_status  as enum ('active','closed');
create type content_status   as enum ('planned','uploaded','canceled');         -- 예정/업로드완료/취소
create type content_kind     as enum ('pr','own','deal');                       -- 브랜드PR/개인/외부PR안건
create type match_source     as enum ('auto','manual');                         -- 자동/수동 매칭
create type video_status     as enum ('none','pending','downloading','ready','failed');
create type ig_account_status as enum ('active','expired','revoked');
create type secondary_scope  as enum ('ad_creative','sns_regram','offline','web','other');
create type secondary_status as enum ('requested','reviewing','creator_confirming','approved','rejected','expired');
create type deal_type        as enum ('ahchannel','creator');                   -- ah!channel 인입 / 크리에이터 개별
create type deal_source      as enum ('creator_email','creator_dm','company_email');
-- deal 진행 단계는 정렬·비교 편의상 smallint(0~5)로 저장:
-- 0 intake(인입) 1 review(매니저 검토) 2 negotiating(크리에이터 협의)
-- 3 client(의뢰사 전달) 4 contracted(계약 성사) 5 producing(제작·업로드)

-- 81'DEGREE creator-os · 0002 tables
create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ── 사용자 · 테넌트 ────────────────────────────────
-- auth.users(Supabase) 와 1:1. 역할·소속 매핑 = RLS 격리 기준.
create table profiles (
  id           uuid primary key references auth.users on delete cascade,
  role         app_role not null default 'creator',
  status       account_status not null default 'active',
  email        text,
  display_name text,
  last_login_at timestamptz,
  created_at   timestamptz not null default now()
);

create table brands (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,                       -- 정규 표기 (예: 'abib')
  aliases   text[] not null default '{}',        -- 표기 혼용 매핑 ['Abib','ABIB']
  color     text,                                -- 차트/칩 색
  domain_allowlist text[] not null default '{}', -- 이메일 도메인 화이트리스트
  created_at timestamptz not null default now()
);

-- 브랜드 멤버십 (한 브랜드에 여러 담당자)
create table brand_members (
  brand_id uuid not null references brands on delete cascade,
  user_id  uuid not null references profiles on delete cascade,
  primary key (brand_id, user_id)
);

create table creators (
  id           uuid primary key default gen_random_uuid(),
  pic          int,                              -- 담당 PIC 번호
  name         text not null,                    -- 정규 이름
  aliases      text[] not null default '{}',     -- 시트별 표기 매핑
  user_id      uuid references profiles on delete set null, -- 크리에이터 로그인 계정
  handle       text,                             -- 인스타 핸들 (@)
  photo_url    text,                             -- 프로필 사진 (Storage/Meta)
  followers    int not null default 0,
  status       creator_status not null default 'active',
  category     text,                             -- 주력 카테고리
  tone         text,                             -- 콘텐츠 톤
  intro        text,                             -- 소개
  monthly_quota int,                             -- 월 계약 수량
  fixed_cost   numeric not null default 0,       -- 월 고정비
  contract_date date,
  start_date   date,
  sns          jsonb not null default '{}',      -- {youtube,tiktok,x,line}
  rates        jsonb not null default '{}',      -- {reels,secondary,offline,etc}
  created_at   timestamptz not null default now()
);

-- ── 계약 · 배정 ────────────────────────────────────
create table contracts (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references brands on delete cascade,
  year_month text not null,                      -- 'YYYY-MM'
  quota      int not null default 0,             -- 계약 편수
  unit_price numeric not null default 500000,    -- 건당 단가 (10건=500만)
  status     contract_status not null default 'active',
  unfulfilled_policy text,                       -- [미결 D] 예약
  created_at timestamptz not null default now(),
  unique (brand_id, year_month)
);

create table assignments (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid not null references brands on delete cascade,
  creator_id uuid not null references creators on delete cascade,
  year_month text not null,                      -- 'YYYY-MM'
  quota      int not null default 0,             -- 이 크리에이터 배정 편수
  created_at timestamptz not null default now(),
  unique (brand_id, creator_id, year_month)
);

-- ── 콘텐츠 · 스냅샷 ────────────────────────────────
create table contents (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid references brands on delete set null,   -- 외부PR은 client명 사용 가능
  creator_id    uuid not null references creators on delete cascade,
  deal_id       uuid,                             -- 외부 PR 안건 연결 (fk 아래서 추가)
  client        text,                             -- 외부PR 의뢰사명 (brand 아닌 경우)
  ig_media_id   text unique,
  permalink     text,
  thumbnail_url text,
  caption       text,
  product       text,                             -- 상품/제목
  kind          content_kind not null default 'pr',
  planned_date  date,                             -- 업로드 예정일
  published_at  timestamptz,                      -- 실제 게시 (카운트 기준)
  status        content_status not null default 'planned',
  match_source  match_source,                     -- 자동/수동 [미결 B]
  sched         jsonb not null default '{}',      -- {plan,shoot,edit,upload}
  verified_by   uuid references profiles,
  -- 영상 아카이빙 (permalink 자동 다운로드 → 스토리지)
  archived_video_url text,
  video_status  video_status not null default 'none',
  video_error   text,
  created_at    timestamptz not null default now()
);

create table content_metric_snapshots (
  id           uuid primary key default gen_random_uuid(),
  content_id   uuid not null references contents on delete cascade,
  captured_at  timestamptz not null default now(),
  views int, reach int, likes int, comments int, saved int, shares int, follows int,
  avg_watch_time numeric,
  is_confirmed boolean not null default false,    -- D+7 근접 = 확정 [미결 C]
  unique (content_id, captured_at)
);

-- ── IG 연동 · 계정/오디언스 스냅샷 ─────────────────
create table ig_accounts (
  id         uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators on delete cascade,
  ig_user_id text,
  token      text,                                -- 저장 시 암호화 (Vault) — 서비스롤만 조회
  scope      text[] not null default '{}',
  linked_at  timestamptz,
  expires_at timestamptz,                         -- 토큰 만료 (60일)
  status     ig_account_status not null default 'active'
);

create table creator_account_snapshots (
  id         uuid primary key default gen_random_uuid(),
  creator_id uuid not null references creators on delete cascade,
  date       date not null,
  followers int, reach int, views int, profile_views int,
  unique (creator_id, date)
);

create table creator_audience_snapshots (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references creators on delete cascade,
  captured_at timestamptz not null default now(),
  gender_age jsonb, country jsonb, city jsonb
);

-- ── 2차 활용 ──────────────────────────────────────
create table secondary_usage_requests (
  id         uuid primary key default gen_random_uuid(),
  brand_id   uuid references brands on delete set null,
  content_id uuid not null references contents on delete cascade,
  scope      secondary_scope not null,
  channels   text[] not null default '{}',
  period_start date, period_end date,
  fee        numeric,
  status     secondary_status not null default 'requested',
  creator_consented_at timestamptz,               -- 동의 없이 approved 불가(트리거로 강제)
  created_at timestamptz not null default now()
);

-- ── PR 안건 (인입→계약→제작) ───────────────────────
create table deals (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,                      -- 'D-101' 표시용
  title         text not null,
  client        text not null,                    -- 의뢰 회사
  creator_id    uuid not null references creators on delete cascade,
  manager       text,                             -- 담당 매니저 (mai/yuta)
  source        deal_source not null default 'company_email',
  type          deal_type not null default 'creator',
  brief         text,                             -- 요청사 콘텐츠 브리핑
  fee           numeric not null default 0,
  share_company int not null default 50,
  share_creator int not null default 50,
  due_date      date,                             -- 콘텐츠 납기일
  upload_date   date,                             -- 업로드 일자
  step          smallint not null default 0,      -- 0~5 파이프라인
  content_id    uuid references contents on delete set null,
  created_at    timestamptz not null default now()
);
alter table contents add constraint contents_deal_fk
  foreign key (deal_id) references deals on delete set null;

-- ── 감사 로그 ─────────────────────────────────────
create table audit_logs (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references profiles,
  action     text not null,                       -- 'secondary.request','data.export','role.change'...
  target     text,
  meta       jsonb,
  created_at timestamptz not null default now()
);

-- 인덱스
create index on contents (brand_id);
create index on contents (creator_id);
create index on contents (published_at);
create index on content_metric_snapshots (content_id, captured_at);
create index on assignments (year_month);
create index on deals (creator_id);
create index on deals (step);

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

-- 81'DEGREE creator-os · demo seed (0001~0003 적용 후 실행)
-- 브랜드
insert into brands (name, color) values
  ('abib','#0E9E9A'),('naming','#E0518A'),('amuse','#F0A93B'),('vidivici','#6C5CE7'),('whipped','#F06595');

-- 크리에이터
insert into creators (pic,name,handle,followers,status,category,tone,monthly_quota,fixed_cost,intro,sns,rates) values
 (1,'merumi','@merumichandayo',27000,'active','스킨케어','에디토리얼',10,100000,'도쿄 기반 스킨케어·뷰티 에디토리얼 릴스.', '{"tiktok":"@merumi.tt","line":"merumi_01"}','{"reels":250000,"secondary":150000,"offline":230000,"etc":0}'),
 (2,'hina','@hinamiru',140000,'active','데일리','데일리',8,100000,'거리 인터뷰·데일리 브이로그로 20대 여성 팬층 확보.', '{"youtube":"@hinamiru","tiktok":"@hinamiru","x":"@hinamiru"}','{"reels":700000,"secondary":420000,"offline":630000,"etc":0}'),
 (3,'rui','@ruiluiruilui',50000,'active','메이크업','트렌디',8,100000,'트렌디 메이크업 튜토리얼·GRWM 중심.', '{"tiktok":"@rui.lui","x":"@ruiluirui"}','{"reels":400000,"secondary":240000,"offline":360000,"etc":0}'),
 (4,'momoco','@momo_2404',26000,'active','스킨케어','리뷰',15,100000,'스킨케어 리뷰·하울 전문.', '{"youtube":"@momoco","line":"momoco24"}','{"reels":250000,"secondary":150000,"offline":230000,"etc":0}'),
 (5,'momo','@_bogsuny',18500,'active','스킨케어','데일리',3,100000,'데일리 코디·뷰티 리뷰.', '{}','{"reels":150000,"secondary":90000,"offline":140000,"etc":0}'),
 (6,'chihiro','@ichi__da',132000,'active','리뷰','리뷰',2,100000,'제품 언박싱·리뷰어.', '{"youtube":"@ichida","tiktok":"@ichi_da"}','{"reels":700000,"secondary":420000,"offline":630000,"etc":0}'),
 (15,'kyoka','@kyokakikukeko',74000,'on_hold','데일리','데일리',0,0,'', '{}','{"reels":400000,"secondary":240000,"offline":360000,"etc":0}');

-- 계약 (2026-08)
insert into contracts (brand_id, year_month, quota, unit_price)
select id, '2026-08', q, 500000 from brands
  join (values ('abib',5),('naming',4),('amuse',3),('vidivici',2),('whipped',2)) v(n,q) on v.n = brands.name;

-- 배정 (2026-08)
insert into assignments (brand_id, creator_id, year_month, quota)
select b.id, c.id, '2026-08', v.q from
  (values ('abib','hina',2),('abib','merumi',2),('abib','rui',1),('naming','momo',2),('naming','hina',1),
          ('amuse','kyoka',2),('amuse','momo',1),('vidivici','chihiro',1),('vidivici','hina',1),('whipped','rui',1)) v(bn,cn,q)
  join brands b on b.name=v.bn join creators c on c.name=v.cn;

-- 콘텐츠 (일부 · 게시완료)
insert into contents (brand_id, creator_id, product, kind, planned_date, published_at, status, permalink, video_status)
select b.id, c.id, v.product, 'pr', v.planned::date, v.pub::timestamptz, 'uploaded', v.link, 'ready' from
  (values
    ('abib','hina','ヒアルロニックブームセラム','2026-07-14','2026-07-16','https://www.instagram.com/reel/DaSePDuv51z/'),
    ('abib','rui','アビブ ガムシートマスク','2026-08-05','2026-08-07','https://www.instagram.com/reel/DZKjTlaSLHB/'),
    ('naming','momo','over dew glossy lip tint','2026-07-22','2026-07-24','https://www.instagram.com/reel/DbIU1KZvj0p/'),
    ('abib','merumi','아비브 토너패드 8월','2026-08-06','2026-08-08','https://www.instagram.com/reel/Dg2bCdE3fG4/'),
    ('vidivici','chihiro','브이디비디 콜라겐 크림','2026-08-08','2026-08-10','https://www.instagram.com/reel/DdRt5uVn8Kc/')
  ) v(bn,cn,product,planned,pub,link)
  join brands b on b.name=v.bn join creators c on c.name=v.cn;

-- 지표 스냅샷 (콘텐츠별 1건, 확정)
insert into content_metric_snapshots (content_id, views, reach, likes, comments, saved, shares, is_confirmed)
select ct.id, v.views, v.reach, v.likes, v.comments, v.saved, v.shares, true from
  (values
    ('ヒアルロニックブームセラム',125050,86201,2526,8,270,55),
    ('アビブ ガムシートマスク',45228,22899,486,6,41,10),
    ('over dew glossy lip tint',98700,71400,1980,34,212,41),
    ('아비브 토너패드 8월',69200,50100,1290,18,150,22),
    ('브이디비디 콜라겐 크림',31200,24500,720,12,96,15)
  ) v(product,views,reach,likes,comments,saved,shares)
  join contents ct on ct.product=v.product;

-- PR 안건
insert into deals (code,title,client,creator_id,manager,source,type,brief,fee,share_company,share_creator,due_date,upload_date,step)
select v.code,v.title,v.client,c.id,v.mgr,v.src::deal_source,v.typ::deal_type,v.brief,v.fee,v.sc,v.scr,v.due::date,v.up::date,v.step from
  (values
    ('D-102','ロート製薬 스킨케어 PR','ロート製薬','hina','yuta','company_email','ahchannel','신제품 세럼 3주 루틴.',2500000,50,50,'2026-08-18','2026-08-20',5),
    ('D-101','Ray Beams 가을 코디','Ray Beams','momo','mai','company_email','creator','가을 신상 3코디 룩북.',1200000,50,50,'2026-08-25','2026-08-28',4),
    ('D-103','資生堂 신제품 언박싱','資生堂','chihiro','mai','company_email','creator','파운데이션 언박싱+발색.',1800000,50,50,'2026-09-05',null,2),
    ('D-104','コーセー 메이크업 튜토리얼','コーセー','rui','yuta','creator_email','creator','가을 톤 데일리 메이크업.',1500000,60,40,'2026-09-10',null,1)
  ) v(code,title,client,cn,mgr,src,typ,brief,fee,sc,scr,due,up,step)
  join creators c on c.name=v.cn;
