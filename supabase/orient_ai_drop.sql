-- 오리엔시트 AI 요약 기능 삭제: 요약 전용 컬럼(저장된 요약 데이터 포함) 제거
-- Supabase SQL Editor에서 1회 실행. (orient_ai.sql로 추가했던 컬럼의 역방향)
alter table public.orient_sheets
  drop column if exists ai_summary,
  drop column if exists ai_summary_ja,
  drop column if exists ai_data,
  drop column if exists ai_status,
  drop column if exists ai_at;
notify pgrst, 'reload schema';
