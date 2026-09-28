-- 샘플 상태(관리자·크리에이터 지정): received(수령 완료) | waiting(미수령·대기)
-- 미수령(waiting)으로 지정된 건이 업로드일을 넘기면 'CC 지연'이 아닌 '샘플 미수령 지연(브랜드 사유)'으로 표기.
alter table public.contents add column if not exists sample_status text;
-- 기존 수령 여부(sample_received) 반영
update public.contents set sample_status = 'received' where sample_received = true and sample_status is null;
