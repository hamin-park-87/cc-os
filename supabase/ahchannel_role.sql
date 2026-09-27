-- ah!channel 에디터 역할 추가 (app_role enum 확장)
-- 이 값이 있어야 관리자가 ah!channel 에디터 계정을 만들 수 있습니다.
alter type app_role add value if not exists 'ahchannel';
