-- PR 메일 자동등록 견고성: 크리에이터 미매칭 안건도 등록되도록 creator_id NULL 허용
-- (미매칭 시 🔎확인필요로 등록 → 어드민에서 수동으로 크리에이터 지정)
alter table public.deals alter column creator_id drop not null;
