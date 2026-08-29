# coocoo에게: PR 안건 메일 자동 등록 역할 요청서

## 배경 / 목표
`contact@81degree.com` (yuta·mai 공용)로 **외부 업체의 PR/협업 의뢰 메일**이 오면
누락 없이 **cc-os(크리에이터 OS)에 "PR 안건"으로 자동 등록**하고 싶어.
coocoo가 "판단 + 정보추출" 두뇌 역할을 맡고, cc-os는 등록 입력구(API)를 제공해.

---

## coocoo에게 먼저 확인하고 싶은 것 (가능 여부)
1. **외부 URL로 HTTP POST(웹훅 호출) 를 보낼 수 있어?**
   (옵시디언 저장·슬랙 전송처럼, "cc-os에 안건 등록" 액션을 하나 추가 가능한지)
2. **의뢰 메일을 어떻게 받을 수 있어?** — 아래 중 가능한 것:
   - (a) `contact@81degree.com` 메일함을 직접 읽기
   - (b) 그 메일을 특정 **슬랙 채널(예: #pr_인입)** 로 흘려보내면 coocoo가 그 채널을 읽기
3. **지정한 JSON 형식으로 결과를 출력**할 수 있어?
4. **판단 신뢰도(confidence)** 를 스스로 매길 수 있어? (오등록 방지용)

---

## coocoo가 해줄 일 (역할 정의)

### ① 판단 — 이 메일이 PR/협업 의뢰인가?
- **맞음**: 외부 업체/브랜드/에이전시가 크리에이터에게 광고·협찬·콜라보·영상 제작을 의뢰
- **아님**: 스팸, 뉴스레터, 일반 문의, 청구서, 사내 메일, 이력서 등
- 애매하면 `isDeal:false` 또는 `confidence` 낮게 → cc-os가 "확인 필요"로 보류

### ② 추출 — 아래 정보를 메일에서 뽑아 JSON으로
| 필드 | 설명 | 없으면 |
|---|---|---|
| client | 의뢰사(회사/브랜드명) | 발신자명/도메인 |
| brand | 대상 브랜드(있으면) | null |
| creator | 지목된 크리에이터 이름/핸들(있으면) | null |
| fee | 제안 금액(숫자만) | null |
| currency | 통화 (JPY/KRW 등) | null |
| dueDate | 납기/희망일 (YYYY-MM-DD) | null |
| deliverables | 요청 산출물 (예: 릴스 1편, 2차활용 포함) | null |
| secondaryUsage | 2차 활용(광고 전환) 요청 여부 | false |
| summary | 3줄 이내 핵심 요약(브리핑) | 필수 |

---

## cc-os로 보낼 규격 (이대로 POST 해주면 됨)

- **URL**: `https://cc-os.81degree.com/api/deals/ingest`
- **메서드**: `POST`
- **헤더**: `Content-Type: application/json`, `x-ingest-secret: <시크릿>`  ※ 시크릿 값은 하민이 별도 전달
- **본문(JSON)**:
```json
{
  "isDeal": true,
  "confidence": 0.92,
  "client": "Four Company Inc.",
  "brand": "abib",
  "creator": "hina",
  "fee": 300000,
  "currency": "JPY",
  "dueDate": "2026-09-15",
  "deliverables": "릴스 1편 + 2차활용",
  "secondaryUsage": true,
  "summary": "9월 신제품 릴스 협업 문의. 예산 30만엔, 9/15 게시 희망.",
  "subject": "(원본 메일 제목)",
  "from": "(발신자 이메일)",
  "messageId": "(메일 고유 ID — 중복 방지용, 있으면 꼭)"
}
```

### 규칙
- **중복 방지**: 같은 `messageId` 는 재등록되지 않음 → 메일마다 고유 ID를 꼭 넣어줘.
- `isDeal:false` 또는 `confidence < 0.6` → cc-os가 등록하되 **"확인 필요"** 로 표시(오등록 방지). *(cc-os 쪽에서 처리 예정)*
- `isDeal:true` & 신뢰도 높음 → 비용·납기·크리에이터까지 채워 **자동 인입**.
- 응답이 `{"ok":true}` 면 성공, `{"deduped":true}` 면 이미 등록된 메일.

---

## 요청 요약 (coocoo에게 물어볼 한 줄)
> "contact@ 로 오는 PR 의뢰 메일을 읽고(또는 슬랙 채널로 받아서), PR 안건인지 판단·핵심정보 추출해서,
>  위 JSON 형식으로 `https://cc-os.81degree.com/api/deals/ingest` 에 POST(헤더에 시크릿) 하는 역할을 맡을 수 있어?
>  가능하면 어떤 방식(메일 직접읽기 vs 슬랙 경유)이 편한지, 그리고 HTTP POST 액션 추가가 가능한지 알려줘."

---

## cc-os(하민/개발) 쪽 준비 상태
- 입력구 `/api/deals/ingest` **구축 완료** (현재는 subject/from/body 기반, coocoo용 확장 예정)
- coocoo가 "가능"이면 → ① 위 JSON 전체 필드 받도록 API 확장 ② 시크릿 발급 ③ "확인 필요" 보류 로직 추가
