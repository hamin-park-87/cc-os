# Phase 0 계획 — 스키마 + 수집 인터페이스 + 목업

**PR Content Dashboard · 81degree.inc**
작성 2026-08-22 / 기준: PR_DASHBOARD_SPEC v0.1

---

## 0. 확정 전제 (이번 결정)

- **A. 독립 서비스** — 이 프로젝트가 배정/할당/게시 데이터의 **원본**. brief.OS 의존성 없음.
- **인프라 미보유** — Phase 0은 **로컬 우선**. Postgres 스키마 + 목업 시드로 구성하고, Meta OAuth·수집은 **인터페이스(어댑터)만** 만들어 두고 실연동은 인프라 준비 후.
- **미결 B/C/D/E 권장안 채택** (코드/스키마에 주석으로 명시):
  - B: PR 콘텐츠 식별 = **자동 매칭(해시태그) + 크리에이터 URL 등록 병행** (`match_source`)
  - C: 확정 성과 = **게시 후 D+7 스냅샷** (`is_confirmed`), 실시간 값은 별도 표기
  - D: 미달분 처리 = **[보류]** — 계약서 문구 확정 후. 스키마에는 필드만 예약.
  - E: 크리에이터 개인 콘텐츠 = 브랜드에 **비공개** 기본.
- **영상 아카이빙(신규 결정)** — 내부 관리용. **permalink만 등록하면 자동 다운로드 → 우리 스토리지 보관 → 인앱 재생.** permalink도 함께 저장해 다운로드 실패 시 폴백. (계약 크리에이터 콘텐츠 = 라이선스 확보 전제)

---

## 0-1. 현행 운영 현황 (구글시트 분석 결과)

현재 수작업 흐름과 우리가 대체할 지점:

| 소스 | 역할 | 상태 | 우리 서비스가 대체 |
|---|---|---|---|
| 제작 일정 마스터 | 크리에이터×브랜드×상품, 기획/촬영/편집/업로드 단계, 업로드 URL | 수작업 입력 원천 | `contents` + 크리에이터/관리자 입력 화면 |
| CREATOR INSIGHTS (Notion OCR) | Notion 성과 OCR 자동수집 (PageID·신뢰도) | 자동 | `content_metric_snapshots` (MetaProvider로 대체) |
| ah!channel (IG Graph API) | 릴스 지표 자동수집 (media_id) | 자동 | `content_metric_snapshots` |
| 성과 데이터 시트 | 수동 입력용 | **방치(0건)** | 자동수집으로 제거 |

**발견된 데이터 품질 문제 → 설계 반영 필요:**
1. 브랜드명 표기 혼용(`abib/Abib`, `vidivici/Vidvici` 오타) → **brands 정규화, alias 매핑**
2. 크리에이터 식별 불일치(`momo`/`大阪momo`/`momocomomoco` 동일인) → **creators alias + `match_source`로 해결**
3. 지표 3곳 파편화 → **content_metric_snapshots로 통합·중복제거**
4. 빈 날짜 D-day 오류, permalink 복붙 중복 → 입력 검증·unique 제약

**엔티티 매핑 요점:** contents(planned/status/permalink)는 마스터 1곳이 원천, metric은 자동 2소스로 통합. contracts는 `year_month`/`quota` 컬럼이 시트에 없어 신규 설계(마스터 그룹헤더 `(N건)`이 근사치). secondary_usage는 시트에 전용 컬럼 없음(신규).

---

## 1. Phase 0 범위

### 포함
1. **DB 스키마** 전체 정의 (테이블 + enum + 관계 + 인덱스)
2. **RLS 정책** 설계 (테넌트 격리를 DB 레벨에서 강제)
3. **수집 어댑터 인터페이스** — `IngestProvider` 추상화 + `MockProvider` 구현
4. **목업 시드** — 브랜드 2, 크리에이터 4, 계약/배정/콘텐츠/스냅샷 더미
5. **레포 스캐폴드** — Next.js(App Router) + Supabase 클라이언트 + 마이그레이션 구조

### 제외 (후속 Phase)
- 화면 UI (Phase 1~3)
- 실제 Meta OAuth 연동 및 Graph API 호출 (인프라 준비 후)
- 2차 활용 승인 워크플로우 로직 (Phase 4, 스키마만 준비)
- cron 스케줄러 실배포

---

## 2. 데이터 스키마 (DDL 스케치)

> Postgres. 모든 테이블 `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()` 기본 포함(아래 생략).

### 2-1. Enum
```sql
create type app_role         as enum ('admin','brand','creator');
create type contract_status  as enum ('active','closed');
create type content_status   as enum ('planned','uploaded','canceled');   -- 예정/업로드완료/취소
create type match_source     as enum ('auto','manual');                   -- 자동/수동
create type ig_account_status as enum ('active','expired','revoked');
create type secondary_scope  as enum ('ad_creative','sns_regram','offline','web','other');
create type secondary_status as enum ('requested','reviewing','creator_confirming',
                                      'approved','rejected','expired');
create type video_status     as enum ('none','pending','downloading','ready','failed'); -- 아카이빙 상태
```

### 2-2. 사용자 · 테넌트
```sql
-- auth.users(Supabase) 와 1:1. 역할과 소속 테넌트 매핑.
profiles (
  id uuid pk references auth.users,     -- = auth.uid()
  role app_role not null,
  display_name text,
  email text
)

brands (
  name text not null,                   -- 정규 표기 (예: 'abib')
  aliases text[],                        -- 표기 혼용 매핑 ['Abib','ABIB']
  domain_allowlist text[]                -- 이메일 도메인 화이트리스트
)

-- 브랜드 멤버십(한 브랜드에 여러 담당자)
brand_members ( brand_id uuid fk brands, user_id uuid fk profiles, unique(brand_id,user_id) )

creators (
  name text not null,                    -- 정규 이름
  aliases text[],                        -- 시트별 표기 매핑 ['momo','大阪momo','momocomomoco']
  user_id uuid fk profiles null,        -- 크리에이터 로그인 계정(연동 전 null 가능)
  handle text                            -- @핸들
)
```

### 2-3. 계약 · 배정 · 콘텐츠
```sql
contracts (
  brand_id uuid fk brands,
  year_month text,                       -- 'YYYY-MM'
  quota int,                             -- 계약 편수
  status contract_status default 'active',
  unfulfilled_policy text null           -- [미결 D] 예약 필드
)

assignments (
  contract_id uuid fk contracts,
  creator_id  uuid fk creators,
  quota int                              -- 이 크리에이터 배정 편수
)

contents (
  brand_id      uuid fk brands,
  creator_id    uuid fk creators,
  assignment_id uuid fk assignments null,
  ig_media_id   text,                    -- 릴스 미디어 id (수집 시)
  permalink     text,
  thumbnail_url text,
  caption       text,
  planned_date  date,                    -- 업로드 예정일
  published_at  timestamptz null,        -- 실제 게시(카운트 기준)
  status        content_status default 'planned',
  match_source  match_source null,       -- 자동/수동 [미결 B]
  verified_by   uuid fk profiles null,
  -- 영상 아카이빙 (permalink 자동 다운로드 → 우리 스토리지)
  archived_video_url text null,          -- 우리 스토리지(Supabase Storage/S3) 경로
  video_status  video_status default 'none',
  video_error   text null,               -- 다운로드 실패 사유
  unique(ig_media_id)
)
```

### 2-4. IG 연동 · 스냅샷
```sql
ig_accounts (
  creator_id  uuid fk creators,
  ig_user_id  text,
  token       text,                      -- 저장 시 암호화(pgsodium/Vault) — Phase 0은 목업 토큰
  scope       text[],
  linked_at   timestamptz,
  status      ig_account_status default 'active'
)

creator_account_snapshots (              -- 일 1회
  creator_id uuid fk creators,
  date date,
  followers int, reach int, views int, profile_views int,
  unique(creator_id, date)
)

creator_audience_snapshots (             -- 주 1회로 충분
  creator_id uuid fk creators,
  captured_at timestamptz,
  gender_age jsonb, country jsonb, city jsonb
)

content_metric_snapshots (               -- 일 1회, 게시 후 90일
  content_id uuid fk contents,
  captured_at timestamptz,
  views int, reach int, likes int, comments int,
  saved int, shares int, avg_watch_time numeric,
  is_confirmed boolean default false,    -- D+7 근접 스냅샷 = 확정 [미결 C]
  unique(content_id, captured_at)
)
```

### 2-5. 2차 활용 · 감사 로그
```sql
secondary_usage_requests (
  brand_id   uuid fk brands,
  content_id uuid fk contents,
  scope      secondary_scope,
  channels   text[],
  period_start date, period_end date,
  fee        numeric,
  status     secondary_status default 'requested',
  creator_consented_at timestamptz null  -- 크리에이터 동의 없이 approved 불가(트리거로 강제)
)

audit_logs (
  actor_id  uuid fk profiles,
  action    text,                        -- 'secondary.request','data.export','role.change' ...
  target    text, meta jsonb
)
```

---

## 3. RLS 전략 (핵심)

> 애플리케이션 필터가 아니라 **DB에서 강제**. 클라이언트 필터 금지.

헬퍼 함수:
```sql
current_role()        -- profiles.role of auth.uid()
current_brand_ids()   -- brand_members 로 소속 브랜드 id 집합
current_creator_id()  -- creators.user_id = auth.uid()
```

정책 요약:
| 테이블 | admin | brand | creator |
|---|---|---|---|
| brands / contracts / assignments | 전체 | 본인 브랜드만 | ✕ |
| contents | 전체 | 본인 브랜드 콘텐츠 | 본인 콘텐츠 |
| content_metric_snapshots | 전체 | 본인 브랜드 콘텐츠의 스냅샷 | 본인 콘텐츠 스냅샷 |
| creator_account/audience_snapshots | 전체 | ✕ (개인 데이터 비공개, 미결 E) | 본인만 |
| ig_accounts | 전체 | ✕ | 본인만 |
| secondary_usage_requests | 전체 | 본인 브랜드 | 본인 관련(동의 단계) |
| audit_logs | 전체 | ✕ | ✕ |

- 토큰(`ig_accounts.token`)은 RLS로 크리에이터 본인+admin 외 완전 차단, 조회는 서버 전용 서비스롤로만.

---

## 4. 수집 어댑터 (인터페이스만)

```ts
interface IngestProvider {
  fetchRecentReels(igUserId: string): Promise<ReelRaw[]>          // sync_contents
  fetchContentMetrics(igMediaId: string): Promise<ContentMetric>  // sync_content_metrics
  fetchAccountMetrics(igUserId: string): Promise<AccountMetric>   // sync_account_metrics
  fetchAudience(igUserId: string): Promise<AudienceMetric>        // sync_audience
  checkTokenHealth(igUserId: string): Promise<TokenHealth>        // check_token_health
}

// 영상 아카이빙 어댑터 (별도)
interface VideoArchiver {
  archive(permalink: string): Promise<{ url: string }>            // 다운로드 → 스토리지 업로드 → 경로 반환
}
```
- `MockProvider`: 시드 데이터에서 그럴듯한 값 생성 (평균 시청시간 = 요청시간÷조회수 근사).
- `MetaProvider`: 인프라 준비 후 Instagram Graph API로 구현. **동일 인터페이스라 화면/잡 코드 변경 없음.**
- 매칭 규칙(브랜드 판별): 해시태그 자동 + URL 수동등록 → `match_source` 세팅. 이름은 `brands.aliases`/`creators.aliases`로 정규화.
- **영상 아카이빙 잡(`archive_videos`)**: `video_status='pending'` 콘텐츠를 permalink로 다운로드(비공식 추출) → 스토리지 업로드 → `ready`. 실패 시 `failed` + `video_error`, permalink로 폴백 재생. Phase 0은 `MockArchiver`(더미 경로 반환).

---

## 5. 레포 구조 (스캐폴드 예정)

```
creator os/
├─ docs/                     # 스펙·계획
├─ supabase/
│  ├─ migrations/            # 001_enums.sql, 002_tables.sql, 003_rls.sql
│  └─ seed.sql               # 목업 시드
├─ src/
│  ├─ app/                   # Next.js App Router (Phase 1~ 화면)
│  ├─ lib/
│  │  ├─ db/                 # Supabase 클라이언트(server/service)
│  │  └─ ingest/             # IngestProvider, MockProvider, (MetaProvider)
│  └─ types/                 # DB 타입(생성물)
├─ jobs/                     # sync_* 잡 (Phase 0은 로컬 실행 스크립트)
├─ .env.example
└─ package.json
```

---

## 6. 작업 순서 (Phase 0 체크리스트)

1. [ ] 레포 스캐폴드 + `git init` (Next.js App Router + TS)
2. [ ] Supabase 로컬(또는 마이그레이션 파일)로 enum·테이블 작성 (§2)
3. [ ] RLS 헬퍼 함수 + 정책 작성 (§3)
4. [ ] `IngestProvider` 인터페이스 + `MockProvider` (§4)
5. [ ] 목업 시드 작성 — 브랜드 2 / 크리에이터 4 / 콘텐츠·스냅샷 (§2 검증용)
6. [ ] `sync_*` 잡을 MockProvider로 로컬 실행 → 스냅샷 적재 확인
7. [ ] DB 타입 생성 + 간단한 쿼리로 RLS 격리 스모크 테스트

**완료 기준(DoD)**: 목업 데이터로 "브랜드 계정은 자기 브랜드 콘텐츠·확정성과만, 크리에이터는 본인 것만" 이 RLS로 실제 격리되는 것을 쿼리로 증명.

---

## 7. 다음 결정 필요 시점

- **인프라 준비되면** → `MetaProvider` 구현 + Supabase 프로젝트 연결 + Meta App Review 착수([리스크] 퍼스티 등록 계정만 접근 가능).
- **미결 D(미달분)** → 계약서 문구 확정 시 `unfulfilled_policy` 채움.
