-- 외부 PR 안건: 수주일·입금·청구서 첨부 컬럼 + 첨부 스토리지 버킷
-- Supabase SQL Editor에서 1회 실행.
alter table deals
  add column if not exists received_date date,   -- 수주(최초 수신)일
  add column if not exists payment_due   date,   -- 입금 예정일
  add column if not exists paid_date     date,   -- 입금일
  add column if not exists invoice_file  text;   -- 청구서 첨부 URL

-- 첨부파일 스토리지 (공개 버킷)
insert into storage.buckets (id, name, public) values ('attachments', 'attachments', true)
  on conflict (id) do nothing;
drop policy if exists att_read on storage.objects;
drop policy if exists att_write on storage.objects;
create policy att_read  on storage.objects for select using (bucket_id = 'attachments');
create policy att_write on storage.objects for insert to authenticated with check (bucket_id = 'attachments');

notify pgrst, 'reload schema';
