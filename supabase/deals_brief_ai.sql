-- 의뢰사 원문 인입 + AI 요약 (대시보드)
-- brief_raw: 의뢰사가 보낸 안건 원문 그대로
-- brief_summary: AI가 정리한 구조화 요약(jsonb)
-- brief_ai_status: idle | processing | done | failed
alter table public.deals add column if not exists brief_raw text;
alter table public.deals add column if not exists brief_summary jsonb;
alter table public.deals add column if not exists brief_ai_status text;
alter table public.deals add column if not exists brief_ai_at timestamptz;
