-- 오리엔시트 AI 정리 결과 저장 (Claude가 파일을 읽어 구조화 요약)
alter table public.orient_sheets
  add column if not exists ai_summary   text,        -- 한국어 요약(마크다운)
  add column if not exists ai_summary_ja text,        -- 일본어 요약(마크다운)
  add column if not exists ai_data      jsonb,        -- 구조화 필드(핵심요청·필수요소·톤·해시태그·납기·금지 등)
  add column if not exists ai_status    text default 'none',  -- none|processing|done|failed|unsupported
  add column if not exists ai_at        timestamptz;
