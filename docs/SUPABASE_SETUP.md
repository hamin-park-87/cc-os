# Supabase 연결 가이드

현재 앱은 **Mock 데이터**로 동작합니다. 아래 5단계로 실 DB에 연결합니다.

## 1. 프로젝트 생성
- https://supabase.com → New project (무료). 리전은 `Northeast Asia (Tokyo)` 권장.
- 생성 후 **Project Settings → API** 에서 다음을 복사:
  - `Project URL`
  - `anon public` key
  - `service_role` key (서버 전용, 노출 금지)

## 2. 스키마 적용
Supabase 대시보드 → **SQL Editor** 에서 순서대로 실행:
```
supabase/migrations/0001_enums.sql
supabase/migrations/0002_tables.sql
supabase/migrations/0003_rls.sql
supabase/seed.sql        (데모 데이터, 선택)
```
(또는 로컬에 Supabase CLI가 있으면 `supabase db push`)

## 3. 환경변수
프로젝트 루트에 `.env.local` 생성 (`.env.example` 참고):
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_DATA_SOURCE=supabase
```

## 4. Auth (매직링크)
- Supabase → **Authentication → Providers → Email** 활성화 (매직링크).
- 로그인한 사용자의 역할은 `profiles` 로 매핑됩니다. 최초 관리자 계정은 SQL로 직접 삽입:
```sql
-- 이메일로 가입(매직링크) 후, 그 user id로:
insert into profiles (id, role, status, email, display_name)
values ('<auth.users의 id>', 'admin', 'active', 'hmpark@81degree.com', '관리자');
```
- 이후 관리자가 앱의 **계정·권한** 탭에서 브랜드/크리에이터를 초대 → 수락 시 `profiles` + `brand_members`/`creators.user_id` 연결.

## 5. 재시작
```
npm run dev
```
`NEXT_PUBLIC_DATA_SOURCE=supabase` 이고 키가 있으면 `getData()` 가 자동으로 Supabase 프로바이더를 사용합니다. RLS가 적용돼 로그인 역할에 맞는 데이터만 조회됩니다.

## 참고
- 데이터가 없으면 화면이 비어 보입니다 → `seed.sql` 실행 여부 확인.
- RLS 때문에 로그인 전에는 아무 데이터도 안 보이는 게 정상입니다.
- Meta 연동(수집 잡)은 이후 단계: `META_APP_ID/SECRET` + Edge Function/워커.
