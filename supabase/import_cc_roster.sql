-- ============================================================
-- CC(콘텐츠 크리에이터) 13명 계약·정산 정보 import
--  · 시트: 외주사·프리랜서 마스터 (D열 = CC 인 사람)
--  · 실행 전 순서:
--     1) creator_details.sql  (컬럼 추가) 먼저 실행
--     2) demo_anon_read.sql 의 "제거" 블록 실행  ← ★PII 노출 차단(필수)★
--     3) 이 파일 실행
--  · 은행계좌·전화·주소 = 민감정보(PII). 2)를 건너뛰면 로그인 없이 노출됩니다.
-- ============================================================

-- ── 기존 7명 UPDATE (DB id 기준) ─────────────────────────────
update creators set
  email='merumi_setokawa@81degree.com', phone='090-9682-2259',
  bank_account='三菱UFJ銀行 表参道支店 보통 0926776', entity_type='individual', withholding=true,
  contract_date='2026-04-27', contract_end='2026-12-31', base_fee=250000, pay_cycle='월말마감 익월 10일 지급'
where id='f1e7e4ce-1151-4de0-9191-009bb601a585'; -- merumi

update creators set
  email='hinamiru@81degree.com', phone='080-6914-4840',
  bank_account='楽天銀行 ポルカ支店 보통 2276186', entity_type='individual', withholding=true,
  contract_date='2026-06-01', contract_end='2026-12-31', base_fee=600000, pay_cycle='월말마감 익월 10일 지급'
where id='00160330-5fc1-44f5-96be-8be27de73448'; -- hina (hinamiru) ※기본보수 시트 표기 상이(600k/300k) 확인要

update creators set
  email='rui@81degree.com', phone='080-5868-5366',
  bank_account='三菱UFJ銀行 新宿中央支店 보통 6293595', entity_type='individual', withholding=true,
  contract_date='2026-06-01', contract_end='2026-12-31', base_fee=150000, pay_cycle='월말마감 익월 10일 지급'
where id='c8740c53-0c13-43ae-b5e2-112bafbd9fd2'; -- rui

update creators set
  email='momoco@81degree.com', phone='090-7195-1655',
  bank_account='埼玉りそな銀行 鶴瀬支店 486 普通 4546462',
  address='541-0056 大阪府大阪市中央区久太郎町1-5-15 M''PLAZA1501', entity_type='individual', withholding=true,
  contract_date='2026-07-01', contract_end='2026-12-31', base_fee=300000, pay_cycle='월말마감 익월 10일 지급'
where id='27e9399a-889a-412e-b65d-a1fe8fa194e5'; -- momoco (藤田桃子)

update creators set
  email='momo@81degree.com', phone='090-9294-8777',
  bank_account='楽天銀行 カノン支店 普通 3617921',
  address='東京都葛飾区青砥4-28-11オリヴィエ401', entity_type='individual', withholding=true,
  contract_date='2026-07-14', contract_end='2026-12-31', base_fee=200000, pay_cycle='월말마감 익월 10일 지급'
where id='07846c2b-b07c-4c7c-9758-0b74aa588137'; -- momo (弘田桃 hirota momo)

update creators set
  entity_type='individual', withholding=true,
  contract_date='2026-08-01', base_fee=600000, pay_cycle='월말마감 익월 10일 지급'
where id='ba77ef4c-deb4-482e-9c44-5dc88214fe1b'; -- chihiro (石田ちひろ)

update creators set
  email='kyoka@81degree.com', entity_type='individual', withholding=true,
  contract_date='2026-06-01', contract_end='2026-12-31', base_fee=180000, pay_cycle='월말마감 익월 10일 지급'
where id='c306f98a-e81c-47df-bc21-7f9d358abe9e'; -- kyoka

-- ── 신규 6명 INSERT ─────────────────────────────────────────
insert into creators (name, handle, followers, status, category, sns, rates,
  email, phone, bank_account, entity_type, withholding, contract_date, contract_end, base_fee, pay_cycle)
values
  ('rico', null, 0, 'active', null, '{}'::jsonb, '{"reels":0,"secondary":0,"offline":0,"etc":0}'::jsonb,
   'rico_sawazaki@81degree.com', '090-7015-3320', '楽天銀行 ビオラ支店 보통 3235008', 'individual', true,
   '2026-05-01', '2026-12-31', 200000, '월말마감 익월 10일 지급'),
  ('kainoa', null, 0, 'active', null, '{}'::jsonb, '{"reels":0,"secondary":0,"offline":0,"etc":0}'::jsonb,
   null, null, null, 'individual', true, '2026-08-01', null, 230000, '월말마감 익월 10일 지급'),
  ('seina', null, 0, 'active', null, '{}'::jsonb, '{"reels":0,"secondary":0,"offline":0,"etc":0}'::jsonb,
   null, null, null, 'individual', true, '2026-08-01', null, 100000, '월말마감 익월 10일 지급'),
  ('nanako', null, 0, 'active', null, '{}'::jsonb, '{"reels":0,"secondary":0,"offline":0,"etc":0}'::jsonb,
   null, null, null, 'individual', true, '2026-08-01', null, 100000, '월말마감 익월 10일 지급'),
  ('rua', null, 0, 'active', null, '{}'::jsonb, '{"reels":0,"secondary":0,"offline":0,"etc":0}'::jsonb,
   null, null, null, 'individual', true, '2026-08-01', null, 50000, '월말마감 익월 10일 지급'),
  ('momo_osaka', null, 0, 'active', null, '{}'::jsonb, '{"reels":0,"secondary":0,"offline":0,"etc":0}'::jsonb,
   null, null, null, 'individual', true, '2026-08-01', null, 150000, '월말마감 익월 10일 지급');
