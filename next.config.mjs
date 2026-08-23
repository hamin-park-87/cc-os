/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Instagram/Meta CDN + Supabase Storage 프로필/썸네일 허용 (실연동 시 도메인 확정)
    remotePatterns: [
      { protocol: "https", hostname: "*.cdninstagram.com" },
      { protocol: "https", hostname: "scontent.cdninstagram.com" },
      { protocol: "https", hostname: "*.supabase.co" },
    ],
  },
};
export default nextConfig;
