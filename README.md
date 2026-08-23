# 81'DEGREE · creator-os

크리에이터 PR 콘텐츠 아카이빙 & 리포팅 플랫폼 (독립 서비스).

## 스택
- **Next.js 15 (App Router) + React 19 + TypeScript**
- **Supabase (Postgres/Auth/RLS)** — 스키마는 `supabase/migrations`. 현재는 **Mock 데이터 계층**으로 동작.
- 수집·아카이빙: `src/lib/ingest` 어댑터 (Mock ↔ Meta Graph API 교체 가능)

## 실행
```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 프로덕션 빌드 + 타입체크
```
로그인 화면 하단 **데모 빠른 로그인**(관리자 / 브랜드 abib / 크리에이터 hina)으로 역할별 화면 진입.

## 구조
```
supabase/migrations/   0001 enums · 0002 tables · 0003 rls   (Supabase에 순서대로 적용)
supabase/seed.sql      초기 시드 (선택)
src/lib/types.ts       도메인 타입 (스키마와 1:1)
src/lib/data/          DataProvider 인터페이스 + Mock + seed  (getData() 로 접근)
src/lib/ingest/        IngestProvider · VideoArchiver 인터페이스 + Mock
src/lib/auth/          세션 (Phase 0: localStorage → 추후 Supabase Auth)
src/lib/i18n.ts        KO/JA 사전
src/components/         Login · AppShell · 역할별 대시보드
```

## 데이터 소스 전환
`.env` 에 `NEXT_PUBLIC_DATA_SOURCE=supabase` + Supabase 키를 넣고 `src/lib/data/index.ts` 에
Supabase 프로바이더를 구현하면 실 DB로 전환됩니다. (마이그레이션 SQL을 프로젝트에 적용)

## 상태
- [x] Phase 0 스캐폴드 — 스키마/RLS SQL, 타입, Mock 데이터 계층, 로그인·역할 라우팅, 역할별 대시보드 뼈대
- [ ] 프로토타입 화면 전체 이식 (배정/비용/연동/2차활용/AI 코치 등)
- [ ] Supabase 프로젝트 연결 + Auth 매직링크
- [ ] Meta OAuth 연동 + 수집 잡 (sync_*) + 영상 아카이버

전체 UX 프로토타입: `docs/ui-prototype.html`
