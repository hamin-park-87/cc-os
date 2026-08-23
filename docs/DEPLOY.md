# 배포 & 도메인 연결 (Vercel)

Next.js는 Vercel이 가장 쉽습니다. GitHub에 올리고 Vercel에 연결 → 도메인 붙이기.

## 1. GitHub에 코드 올리기
1. github.com/new 에서 **빈 저장소** 생성 (예: `creator-os`, private). README 등 체크 해제.
2. 터미널에서 (프로젝트 폴더):
   ```bash
   git branch -M main
   git remote add origin https://github.com/<본인계정>/creator-os.git
   git push -u origin main
   ```
   - 비밀번호 대신 **Personal Access Token** 요구 시: github.com → Settings → Developer settings → Tokens(classic) → repo 권한으로 발급해 붙여넣기.

## 2. Vercel 배포
1. vercel.com → GitHub로 로그인 → **Add New → Project** → 방금 repo Import.
2. Framework: **Next.js** 자동 인식. **Environment Variables**에 추가:
   | Key | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | https://knxnsmulusljzdedbtyy.supabase.co |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (anon/publishable 키) |
   | `NEXT_PUBLIC_DATA_SOURCE` | supabase |
   | `SUPABASE_SERVICE_ROLE_KEY` | (service_role secret 키) |
3. **Deploy** → 몇 분 뒤 `https://creator-os-xxxx.vercel.app` 생성.

## 3. 도메인 연결
1. Vercel 프로젝트 → **Settings → Domains** → `creator-os.81degree.com` 입력 → Add.
2. Vercel이 알려주는 DNS 레코드를 **도메인 등록기관(81degree.com DNS)** 에 추가:
   - 보통 `CNAME`  `creator-os` → `cname.vercel-dns.com`
3. 몇 분~수십 분 뒤 자동 SSL(https) 발급 완료.

## 4. Supabase 인증 URL 업데이트 (중요)
Supabase → **Authentication → URL Configuration**:
- **Site URL**: `https://creator-os.81degree.com`
- **Redirect URLs**에 `https://creator-os.81degree.com` 추가 (localhost도 유지 가능)
→ 안 하면 프로덕션에서 매직링크/초대 링크가 안 돌아옵니다.

## 5. (권장) 프로덕션 보안
- 데모용 `demo_anon_read.sql` 정책 **제거** (프로덕션에선 anon 전체조회 위험):
  `demo_anon_read.sql`의 "제거" 블록(drop policy들) 실행.
- 실제 인증(로그인)만으로 RLS 격리가 동작하도록.

## 자동 배포
이후 `git push` 하면 Vercel이 자동 재배포합니다.
