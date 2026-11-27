import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "81'DEGREE",
  description: "크리에이터 PR 콘텐츠 아카이빙 & 리포팅 플랫폼",
  // 홈 화면에 추가했을 때(앱처럼 열 때) 설정 — 브라우저에서 볼 때는 영향 없음
  applicationName: "cc-os",
  appleWebApp: { capable: true, title: "cc-os", statusBarStyle: "black-translucent" },
  icons: { apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#0F120F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* 저장된 테마가 있으면 적용, 없으면 다크 유지 (깜빡임 방지) */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('creatoros.theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
