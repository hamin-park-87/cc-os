-- 81'DEGREE creator-os · 0001 enums
-- 실행 순서: 0001 → 0002 → 0003 → seed.sql

create type app_role         as enum ('admin','brand','creator');
create type account_status   as enum ('pending','active','disabled');
create type creator_status   as enum ('active','preparing','on_hold');          -- 활동중/계약준비/보류
create type contract_status  as enum ('active','closed');
create type content_status   as enum ('planned','uploaded','canceled');         -- 예정/업로드완료/취소
create type content_kind     as enum ('pr','own','deal');                       -- 브랜드PR/개인/외부PR안건
create type match_source     as enum ('auto','manual');                         -- 자동/수동 매칭
create type video_status     as enum ('none','pending','downloading','ready','failed');
create type ig_account_status as enum ('active','expired','revoked');
create type secondary_scope  as enum ('ad_creative','sns_regram','offline','web','other');
create type secondary_status as enum ('requested','reviewing','creator_confirming','approved','rejected','expired');
create type deal_type        as enum ('ahchannel','creator');                   -- ah!channel 인입 / 크리에이터 개별
create type deal_source      as enum ('creator_email','creator_dm','company_email');
-- deal 진행 단계는 정렬·비교 편의상 smallint(0~5)로 저장:
-- 0 intake(인입) 1 review(매니저 검토) 2 negotiating(크리에이터 협의)
-- 3 client(의뢰사 전달) 4 contracted(계약 성사) 5 producing(제작·업로드)
