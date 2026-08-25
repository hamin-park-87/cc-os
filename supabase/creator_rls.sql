-- 크리에이터 권한: 본인 콘텐츠 생성/수정/삭제 + 배정된 브랜드 이름 조회
-- Supabase SQL Editor에서 1회 실행.

-- 1) 크리에이터가 본인(creator_id=my_creator_id()) 콘텐츠를 insert/update/delete
drop policy if exists contents_creator_write  on contents;
drop policy if exists contents_creator_update on contents;
drop policy if exists contents_creator_delete on contents;
create policy contents_creator_write  on contents for insert with check (creator_id = my_creator_id());
create policy contents_creator_update on contents for update using (creator_id = my_creator_id()) with check (creator_id = my_creator_id());
create policy contents_creator_delete on contents for delete using (creator_id = my_creator_id());

-- 2) 크리에이터가 본인에게 배정된 / 콘텐츠가 있는 브랜드의 이름을 조회
drop policy if exists brands_creator_read on brands;
create policy brands_creator_read on brands for select using (
  id in (select brand_id from assignments where creator_id = my_creator_id())
  or id in (select brand_id from contents where creator_id = my_creator_id())
);

notify pgrst, 'reload schema';
