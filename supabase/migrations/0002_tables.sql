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
