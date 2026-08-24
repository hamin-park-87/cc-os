-- 2차 활용: 크리에이터가 본인 콘텐츠 신청건에 '동의'(update)할 수 있도록 RLS 추가
-- (기존엔 admin만 update 가능 → 크리에이터 동의가 막힘). Supabase SQL Editor에서 1회 실행.
drop policy if exists sec_creator_update on secondary_usage_requests;
create policy sec_creator_update on secondary_usage_requests for update
  using (content_id in (select id from contents where creator_id = my_creator_id()))
  with check (content_id in (select id from contents where creator_id = my_creator_id()));
notify pgrst, 'reload schema';
