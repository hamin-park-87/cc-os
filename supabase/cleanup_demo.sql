-- 데모(시드) 데이터 삭제 — 실제 동기화/입력 데이터는 유지
-- Supabase SQL Editor에서 1회 실행. (실제 인스타 동기화 콘텐츠는 ig_media_id가 있어 보존됨)

-- 1) 시드 콘텐츠(가짜 릴스) + 지표 스냅샷(cascade) 삭제
delete from contents where permalink in (
  'https://www.instagram.com/reel/DaSePDuv51z/',
  'https://www.instagram.com/reel/DZKjTlaSLHB/',
  'https://www.instagram.com/reel/DbIU1KZvj0p/',
  'https://www.instagram.com/reel/Dg2bCdE3fG4/',
  'https://www.instagram.com/reel/DdRt5uVn8Kc/'
);
-- 혹시 permalink이 달라진 경우 상품명으로도 정리 (동기화 콘텐츠는 ig_media_id 있어 제외)
delete from contents where ig_media_id is null and product in (
  'ヒアルロニックブームセラム','アビブ ガムシートマスク','over dew glossy lip tint','아비브 토너패드 8월','브이디비디 콜라겐 크림'
);

-- 2) 시드 PR 안건 삭제
delete from deals where code in ('D-101','D-102','D-103','D-104');

-- 3) (선택) 시드 배정/계약 데모 정리 — 실제로 쓰지 않을 때만 주석 해제
--    ※ 실제로 8월 배정/계약을 입력했다면 실행하지 마세요.
-- delete from assignments where year_month = '2026-08';
-- delete from contracts   where year_month = '2026-08' and monthly_amount is null;

notify pgrst, 'reload schema';
