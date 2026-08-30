# Gmail(contact@) → Slack #cc_pr_gmail 자동 전달 (Apps Script · 무료)

목표: contact@81degree.com 로 온 PR 메일을 `#cc_pr_gmail` 채널로 자동 포스팅 → coocoo가 읽고 판단·등록.
(제3의 툴 없이, contact@ 계정의 Google Apps Script만 사용)

---

## 1) Slack Incoming Webhook 만들기 (#cc_pr_gmail 로 글쓰기용)
1. https://api.slack.com/apps → **쿠쿠(coocoo) 앱 선택** (또는 새 앱 생성)
2. 좌측 **Incoming Webhooks → Activate 켜기**
3. **Add New Webhook to Workspace** → 채널 `#cc_pr_gmail` 선택 → 허용
4. 생성된 **Webhook URL 복사** (`https://hooks.slack.com/services/...`)

## 2) Gmail 필터로 라벨 붙이기 (노이즈 차단, 권장)
Gmail(contact@) → 설정 → **필터 및 차단된 주소 → 새 필터**
- 조건 예: 제목/본문에 `PR` OR `협업` OR `案件` OR `コラボ` OR `お問い合わせ`
- 동작: **라벨 적용 → 새 라벨 `PR인입`** 선택
(전체 메일을 넣고 싶으면 라벨을 "받은편지함 전체"로 잡아도 되지만, coocoo 신뢰도 필터가 있어도 채널이 지저분해지니 라벨 권장)

## 3) Apps Script 설치
contact@81degree.com 계정으로 로그인 → https://script.google.com → **새 프로젝트** → 아래 코드 붙여넣기.
`SLACK_WEBHOOK` 값만 1)에서 복사한 URL로 교체.

```javascript
const SLACK_WEBHOOK = "여기에_Incoming_Webhook_URL";
const LABEL = "PR인입";            // 2)에서 만든 라벨
const DONE  = "PR인입-전송완료";    // 중복 전송 방지용

function forwardToSlack() {
  const label = GmailApp.getUserLabelByName(LABEL);
  if (!label) { Logger.log("라벨 없음: " + LABEL); return; }
  const done = GmailApp.getUserLabelByName(DONE) || GmailApp.createLabel(DONE);
  const threads = label.getThreads(0, 30);
  threads.forEach(function (th) {
    if (th.getLabels().some(function (l) { return l.getName() === DONE; })) return; // 이미 보냄
    const m = th.getMessages()[0]; // 최초 메일 기준
    const text = [
      "*From:* " + m.getFrom(),
      "*Subject:* " + m.getSubject(),
      "*Date:* " + Utilities.formatDate(m.getDate(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm"),
      "*MessageId:* " + m.getId(),   // ← coocoo가 중복방지용 messageId로 사용
      "——",
      m.getPlainBody().slice(0, 3500)
    ].join("\n");
    const res = UrlFetchApp.fetch(SLACK_WEBHOOK, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) th.addLabel(done);
    else Logger.log("Slack 실패 " + res.getResponseCode() + ": " + res.getContentText());
  });
}
```

## 4) 자동 실행 트리거
Apps Script 좌측 **⏰(트리거) → 트리거 추가**
- 함수: `forwardToSlack`
- 이벤트 소스: **시간 기반** → **분 단위 타이머** → **10분마다**
- 저장 → 권한 승인 팝업 → **contact@ 계정으로 허용**

## 5) 테스트
- 직접 contact@ 로 테스트 메일 1통 (제목에 `PR` 포함) 발송
- 10분 내(또는 Apps Script에서 `forwardToSlack` 수동 실행) → `#cc_pr_gmail`에 메시지 뜸
- coocoo가 읽고 판단 → `cc-os /api/deals/ingest` POST → PR 안건 탭 "인입"에 `✉️ 메일` 배지로 등록

---

## 동작 요약
```
contact@ 메일 ─(Gmail 필터: 라벨 PR인입)→ Apps Script(10분) → Slack #cc_pr_gmail
   → coocoo 판단·추출 → POST cc-os /api/deals/ingest → PR 안건(인입) 등록
```
- **중복 방지 2중**: Apps Script `PR인입-전송완료` 라벨 + coocoo가 `messageId`로 cc-os 중복 체크
- coocoo에게 전달: "슬랙 메시지의 `MessageId:` 값을 그대로 `messageId` 필드에 넣어줘 (중복 방지)"
