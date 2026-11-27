import type { MetadataRoute } from "next";

// 휴대폰 "홈 화면에 추가" 용 앱 정보 (PWA 매니페스트)
// - 아이콘 그림은 public/icons/ 폴더에 있음. 같은 이름·같은 크기의 PNG로 덮어쓰면 교체됨.
// - 오프라인 저장(서비스 워커)은 일부러 넣지 않음 → 항상 최신 화면을 불러옴.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "cc-os",
    short_name: "cc-os",
    description: "크리에이터 PR 콘텐츠 아카이빙 & 리포팅 플랫폼",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#050805",
    theme_color: "#0F120F",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
