-- 매직링크 인증 설정: 신규 가입 시 profiles 자동 생성 + 최초 관리자 지정

-- 1) auth.users 에 유저 생기면 profiles 자동 생성 (기본 role=creator)
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role, status)
  values (new.id, new.email, 'creator', 'active')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 2) (최초 1회) 매직링크로 로그인한 뒤, 본인 계정을 관리자로 승격
--    아래 이메일을 본인 것으로 바꿔서 실행하세요.
-- update public.profiles set role='admin' where email='hmpark@81degree.com';
