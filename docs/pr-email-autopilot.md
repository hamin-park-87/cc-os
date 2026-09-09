# contact@ PR 메일 → 자동 안건 등록 + 슬랙 알림 (AI 파이프라인)

```
contact@81degree.com 새 메일
  └ Google Apps Script (10분마다)  →  POST /api/deals/ingest-email
        └ Claude가 PR 의뢰 판단 + 정보 추출
             ├ PR 안건으로 자동 등록 (PR 안건 탭 · 단계 "인입")
             └ Slack #cc_pr_gmail 알림:  [제목]  + 스레드에 세부 내용
```

## 1) Vercel 환경변수 (Settings → Environment Variables → 저장 후 Redeploy)
- `DEALS_INGEST_SECRET` = (이미 설정됨) 랜덤 시크릿
- `ANTHROPIC_API_KEY` = Claude API 키 (메일 판단·추출용). console.anthropic.com 에서 발급
- `SLACK_BOT_TOKEN` = 쿠쿠(coocoo) 앱의 Bot 토큰 `xoxb-...` (스레드 답글에 필요)
- (선택) `PR_SLACK_CHANNEL` = 채널 ID. 기본값 `C0BT56NHA5D`(#cc_pr_gmail)

※ 봇이 #cc_pr_gmail 에 있어야 함(쿠쿠는 이미 전 채널 멤버). Bot Token Scopes: `chat:write`.

## 2) contact@ 계정에 Apps Script 설치
script.google.com(=contact@ 로그인) → 새 프로젝트 → 아래 붙여넣고 `INGEST_SECRET` 교체 → 10분 트리거.

```javascript
const ENDPOINT = "https://cc-os.81degree.com/api/deals/ingest-email";
const INGEST_SECRET = "여기에_DEALS_INGEST_SECRET";
const LABEL = "PR안건";              // Gmail 필터로 이 라벨 자동 부여(노이즈 차단, 권장)
const DONE = "PR안건-등록완료";

function ingestPR() {
  const label = GmailApp.getUserLabelByName(LABEL); if (!label) return;
  const done = GmailApp.getUserLabelByName(DONE) || GmailApp.createLabel(DONE);
  label.getThreads(0, 30).forEach(function (th) {
    if (th.getLabels().some(function (l){ return l.getName() === DONE; })) return;
    const m = th.getMessages()[0];
    const res = UrlFetchApp.fetch(ENDPOINT, {
      method: "post", contentType: "application/json",
      headers: { "x-ingest-secret": INGEST_SECRET },
      payload: JSON.stringify({
        subject: m.getSubject(), from: m.getFrom(), body: m.getPlainBody().slice(0, 8000),
        messageId: m.getId(),
        receivedAt: Utilities.formatDate(m.getDate(), Session.getScriptTimeZone(), "yyyy-MM-dd")
      }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) th.addLabel(done);
    else Logger.log("실패 " + res.getResponseCode() + ": " + res.getContentText());
  });
}
```
트리거: ⏰ → `ingestPR` → 시간 기반 → 10분마다 → contact@ 계정으로 권한 허용.

## 동작·안전장치
- **AI 판단**: PR 의뢰가 아니면(신뢰도 높음) 등록 안 함. 애매하면 `🔎 확인필요`로 등록.
- **중복 방지**: 메일 ID로 재등록 차단 + 처리 스레드에 `PR안건-등록완료` 라벨.
- **크리에이터 자동 매칭**: 제목·본문에 이름/핸들 있으면 연결.
- **Slack 형식**: 메인 `[제목]` → 스레드에 의뢰사·브랜드·크리에이터·금액·납기·산출물·요약·OS 링크.
- `ANTHROPIC_API_KEY` 없으면 AI 없이 제목 기반으로만 등록(폴백).
