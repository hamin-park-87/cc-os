# contact@81degree.com 메일 → PR 안건 자동 등록 (Gmail 연동)

yuta·mai 두 명이 공용으로 쓰는 `contact@81degree.com` 메일함에서 **PR 안건 메일을 놓치지 않도록**,
새 메일을 자동으로 cc-os 시스템에 "PR 안건(단계: 인입)"으로 등록합니다.

## 구조
```
contact@ 받은편지함
   └─(라벨 "PR안건" 자동분류 or 전체)
        └─ Google Apps Script (10분마다 실행)
             └─ POST https://cc-os.81degree.com/api/deals/ingest
                  └─ deals 테이블에 자동 등록 (중복 방지 · 크리에이터 자동 매칭)
```

## 1) Vercel 환경변수 추가
`DEALS_INGEST_SECRET` = (아무도 모르는 긴 랜덤 문자열)
→ 추가 후 **재배포**.

## 2) Gmail 필터로 라벨 만들기 (권장)
Gmail → 설정 → 필터 → 새 필터. PR 문의가 오는 조건(예: 제목에 `PR`/`협업`/`案件`, 또는 특정 폼 주소)을 지정하고
**라벨 `PR안건` 적용**. (라벨 없이 전체를 넣으면 스팸/일반 메일까지 등록되니 라벨 사용을 강력 권장)

## 3) Apps Script 설치
`contact@81degree.com` 계정으로 로그인 → https://script.google.com → 새 프로젝트 → 아래 코드 붙여넣기.
`INGEST_SECRET`만 1)에서 정한 값으로 교체.

```javascript
const ENDPOINT = "https://cc-os.81degree.com/api/deals/ingest";
const INGEST_SECRET = "여기에_DEALS_INGEST_SECRET_값";
const LABEL = "PR안건";          // 이 라벨이 붙은 스레드만 처리 (필터로 자동 부여)
const DONE_LABEL = "PR안건-등록완료"; // 처리된 스레드에 붙일 라벨(중복 방지)

function ingestDeals() {
  const label = GmailApp.getUserLabelByName(LABEL);
  if (!label) { Log.log("라벨 없음: " + LABEL); return; }
  let done = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  const threads = label.getThreads(0, 30);
  threads.forEach(function (th) {
    // 이미 등록완료 라벨이 있으면 skip
    if (th.getLabels().some(function (l) { return l.getName() === DONE_LABEL; })) return;
    const msg = th.getMessages()[0]; // 최초 메일 기준
    const payload = {
      subject: msg.getSubject(),
      from: msg.getFrom(),
      fromName: (msg.getFrom().match(/^(.*?)</) || [,""])[1].trim(),
      body: msg.getPlainBody().slice(0, 4000),
      receivedAt: Utilities.formatDate(msg.getDate(), Session.getScriptTimeZone(), "yyyy-MM-dd"),
      messageId: msg.getId()
    };
    const res = UrlFetchApp.fetch(ENDPOINT, {
      method: "post",
      contentType: "application/json",
      headers: { "x-ingest-secret": INGEST_SECRET },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() === 200) {
      th.addLabel(done); // 성공 시 등록완료 표시
    } else {
      Logger.log("실패 " + res.getResponseCode() + ": " + res.getContentText());
    }
  });
}
```

## 4) 자동 실행 트리거
Apps Script → 왼쪽 ⏰(트리거) → 트리거 추가 → 함수 `ingestDeals`, 이벤트 `시간 기반` → `분 단위 타이머` → `10분마다`.
처음 저장 시 권한 승인 팝업 → contact@ 계정으로 허용.

## 동작·안전장치
- **중복 방지**: 메일 ID(messageId)를 안건 코드(`MAIL-...`)로 저장 → 같은 메일은 재등록 안 됨. 처리된 스레드엔 `PR안건-등록완료` 라벨.
- **크리에이터 자동 매칭**: 제목·본문에 크리에이터 이름/핸들이 있으면 자동 연결, 없으면 미배정으로 등록.
- 등록된 안건은 **PR 안건 탭 → 단계 "인입"**에 나타남 → 담당자가 확인 후 크리에이터·비용·단계 진행.
- 라벨 기반이라 **일반 메일은 등록 안 됨**.

## 대안 (Apps Script 대신)
- **Zapier/Make**: "New Email matching search in Gmail" → "Webhook POST" (헤더 `x-ingest-secret`, 본문 위와 동일).
- **Google Workspace 관리자 위임**: contact@ 를 개인 Gmail에 위임받아 필터 공유.
