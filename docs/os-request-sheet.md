# 81DEGREE OS 개발 요청 접수 시트

- 시트: https://docs.google.com/spreadsheets/d/1QWOXeXwsMIgpast99Fg3eA21Ks3H2ijfaRdtedFsFos/edit
- 목적: 관리자/브랜드/크리에이터가 **역할별·기능별**로 개발요청·수정·오류를 접수

## 컬럼 구조 (요청접수 탭)
| 열 | 항목 | 설명 |
|---|---|---|
| A | 접수번호 | REQ-001 … (자동 채움 가능) |
| B | 접수일 | 날짜 |
| C | 요청자 역할 | 관리자 / 브랜드 / 크리에이터 |
| D | 요청자명 | 이름·브랜드명·크리에이터명 |
| E | 관련 기능 | 어느 화면/기능인지 (드롭다운) |
| F | 요청 유형 | 신규 기능 / 개선·수정 / 오류(버그) / 문의 |
| G | 우선순위 | 긴급 / 높음 / 보통 / 낮음 |
| H | 제목 | 한 줄 요약 |
| I | 상세 내용 | 구체 설명 |
| J | 재현 경로/첨부 | 오류 재현 순서·스크린샷 링크 |
| K | 상태 | 접수 / 검토중 / 진행중 / 완료 / 보류 / 반려 |
| L | 담당자 | 처리 담당 |
| M | 처리 메모 | 처리 내용 |
| N | 완료일 | |

## 드롭다운·대시보드 자동 설치 (Apps Script)
시트에서 **확장 프로그램 → Apps Script** → 아래 코드 붙여넣기 → `setup` 실행(권한 허용).
한 번 실행하면 드롭다운 + 참조 탭 + 대시보드가 생깁니다.

```javascript
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const main = ss.getSheetByName("요청접수") || ss.getSheets()[0];
  main.setName("요청접수");

  // 값 목록
  const ROLES = ["관리자", "브랜드", "크리에이터"];
  const FEATURES = ["대시보드","크리에이터 관리","크리에이터 인사이트","비용 관리","연동 상태",
    "브랜드 관리","PR 안건","배정 관리","제작 일정","콘텐츠 아카이브","2차 활용","계약 리스크",
    "매출 대시보드","계정·권한","이번 달 할일","로그인/계정","모바일/반응형","기타"];
  const TYPES = ["신규 기능","개선·수정","오류(버그)","문의"];
  const PRIOS = ["긴급","높음","보통","낮음"];
  const STATUS = ["접수","검토중","진행중","완료","보류","반려"];

  // 참조 탭
  let ref = ss.getSheetByName("참조") || ss.insertSheet("참조");
  ref.clear();
  const cols = [["역할",ROLES],["기능",FEATURES],["유형",TYPES],["우선순위",PRIOS],["상태",STATUS]];
  cols.forEach(function(c, i){
    ref.getRange(1, i+1).setValue(c[0]).setFontWeight("bold");
    ref.getRange(2, i+1, c[1].length, 1).setValues(c[1].map(function(v){return [v];}));
  });

  // 헤더 고정·서식
  main.setFrozenRows(1);
  main.getRange(1,1,1,14).setFontWeight("bold").setBackground("#1f2a24").setFontColor("#ffffff");

  // 드롭다운(데이터 확인) — 2행~1000행
  const dv = function(list){ return SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build(); };
  main.getRange("C2:C1000").setDataValidation(dv(ROLES));     // 역할
  main.getRange("E2:E1000").setDataValidation(dv(FEATURES));  // 기능
  main.getRange("F2:F1000").setDataValidation(dv(TYPES));     // 유형
  main.getRange("G2:G1000").setDataValidation(dv(PRIOS));     // 우선순위
  main.getRange("K2:K1000").setDataValidation(dv(STATUS));    // 상태

  // 대시보드 탭 (상태·역할·기능별 집계)
  let dash = ss.getSheetByName("대시보드") || ss.insertSheet("대시보드");
  dash.clear();
  dash.getRange("A1").setValue("상태별").setFontWeight("bold");
  STATUS.forEach(function(s, i){
    dash.getRange(2+i, 1).setValue(s);
    dash.getRange(2+i, 2).setFormula('=COUNTIF(요청접수!K:K,A'+(2+i)+')');
  });
  dash.getRange("D1").setValue("역할별").setFontWeight("bold");
  ROLES.forEach(function(r, i){
    dash.getRange(2+i, 4).setValue(r);
    dash.getRange(2+i, 5).setFormula('=COUNTIF(요청접수!C:C,D'+(2+i)+')');
  });
  dash.getRange("G1").setValue("기능별").setFontWeight("bold");
  FEATURES.forEach(function(f, i){
    dash.getRange(2+i, 7).setValue(f);
    dash.getRange(2+i, 8).setFormula('=COUNTIF(요청접수!E:E,G'+(2+i)+')');
  });
  SpreadsheetApp.getUi().alert("설치 완료! 드롭다운·참조·대시보드 탭이 준비됐습니다.");
}
```

## 팀 공유
시트 우상단 **공유** → 관리자/브랜드/크리에이터 담당자 이메일 추가 (또는 링크: 뷰어·편집자 권한).
역할별로 나눠 보고 싶으면 각 역할 열(C)에 **필터 보기** 만들어 두면 됩니다.

## (선택) 다음 단계
- Slack `#요청` 채널 → 이 시트로 자동 적재 (coocoo/Apps Script로 연결 가능)
- 요청 완료 시 요청자에게 자동 알림
