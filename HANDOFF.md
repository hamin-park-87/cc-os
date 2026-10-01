# cc-os 인수인계 (다른 PC·다른 사람이 이어서 작업하기)

이 프로젝트는 **코드(GitHub) + 비밀키(.env) + 외부 서비스 접근권한** 세 가지만 있으면 어디서든 이어서 할 수 있습니다.
배포는 Vercel이 GitHub `main` 푸시를 자동 배포합니다.

## 1) 먼저 받아야 할 접근 권한 (소유자가 초대)
- **GitHub**: `hamin-park-87/cc-os` 저장소 Collaborator 초대
- **Vercel**: cc-os 프로젝트 멤버 (환경변수·배포·로그 확인) — *운영 비밀키의 원본 위치*
- **Supabase**: 프로젝트 멤버 (DB·SQL Editor·키)
- **Anthropic**: API 키 (AI 파싱·초안·요약)
- **Slack 앱**: api.slack.com/apps 의 해당 앱 (봇 토큰·이벤트·서명시크릿)
- **Meta/Instagram 앱**: developers.facebook.com (크리에이터 IG 연동)
- (선택) **Resend**: 이메일 발송 도메인

## 2) 로컬 셋업 (새 PC)
```bash
git clone https://github.com/hamin-park-87/cc-os
cd cc-os
npm install
cp .env.example .env.local      # 값은 Vercel 환경변수에서 복사
npm run dev                     # http://localhost:3000
```
빌드 확인: `npm run build`

## 3) 환경변수 (.env.local) — 값은 **Vercel 프로젝트 환경변수에서 복사**
필수:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_DATA_SOURCE` (DB 사용 시 `supabase`)

기능별:
- `ANTHROPIC_API_KEY` — AI 파싱·답장초안·요약
- `SLACK_BOT_TOKEN` — 슬랙 알림/스레드, `SLACK_SIGNING_SECRET` — 슬랙 이벤트 검증
- `DEALS_INGEST_SECRET` — contact@ 메일 인입(/api/deals/ingest-email)
- `PR_LIST_SECRET` — 경리 구글시트 연동(/api/public/pr-list)
- `META_APP_ID` · `META_APP_SECRET` · `META_REDIRECT_URI` — 인스타 연동
- (선택) `CRON_SECRET`(크론 보호), `RESEND_API_KEY`·`RESEND_FROM`(이메일 발송)
- (선택 채널 오버라이드) `PR_SLACK_CHANNEL`, `CREATOR_SLACK_CHANNEL`, `ACCOUNTING_SLACK_CHANNEL`, `SLACK_REPLY_EMOJI`

> ⚠️ 비밀키는 **절대 git에 커밋 금지**(.env.local은 .gitignore). 공유는 Vercel/비밀번호 매니저로.

## 4) DB 마이그레이션 (Supabase SQL Editor에서 실행)
`supabase/*.sql` 파일들. 신규 환경이거나 미실행분이 있으면 실행. 최근 추가된(미실행 가능) 목록:
- `pr_dashboard_extras.sql`, `deal_comments_parent.sql`, `deals_brief_ai.sql`,
  `deal_fee_nego.sql`, `deal_billing.sql`, `ahchannel_role.sql`, `brands_logo.sql`,
  `fee_proposals_editkey.sql`, `deal_comments_status.sql`, `contents_sample_status.sql`, `slack_events.sql`
> 모두 `if not exists` 기반이라 재실행해도 안전.

## 5) 배포 / 크론
- `main`에 푸시 → Vercel 자동 배포.
- 크론(`vercel.json`): `/api/ig/cron`(매시간 IG 동기화), `/api/reminders/run`(매일; CC 채널 안내는 월요일만).

## 6) Claude Code로 이어서 작업
- 새 PC에 Claude Code 설치 → 위 레포를 열면 됩니다. **대화 맥락은 넘어가지 않지만**, 코드·커밋 이력·`supabase/` 마이그레이션·이 문서가 상태를 담고 있습니다.
- 세션 메모리(`~/.claude/.../memory`)는 PC 로컬이라 자동 이전되지 않습니다.

## 7) 지금 열려있는(진행중) 이슈 — 인수 시 확인
- **슬랙 👌 회신초안 트리거**: Event Subscriptions 활성/재설치가 워크스페이스 제한(Enterprise 전용 기능)으로 막힘 → 앱의 org-level/admin 기능 해제 후 재설치하거나, 폴링/수동 방식으로 대체 검토.
- **주간 i18n 자동점검 루틴**: 클라우드 루틴 생성에 GitHub 계정 연결 필요(`/web-setup`).
- **크리에이터 IG**: `chihiro` 토큰 만료 → 재연동 필요. `seina·nanako·koharu` 슬랙 채널 미매칭.
- **메일 AI 에이전트**: 1단계(초안 생성) 완료. 2단계(승인→contact@ Apps Script 자동 발송)는 미구현.
