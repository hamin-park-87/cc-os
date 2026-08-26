-- 시드(데모) 월별 계약 삭제 — 브랜드 관리 '월 수량'이 실제 값과 안 맞는 문제 해결
-- 시드 계약은 unit_price=500000 표식이 있어 그것만 정확히 제거 (UI로 입력한 월별 계약은 unit_price가 없어 보존됨)
-- Supabase SQL Editor에서 1회 실행.
delete from contracts where unit_price = 500000;
notify pgrst, 'reload schema';
