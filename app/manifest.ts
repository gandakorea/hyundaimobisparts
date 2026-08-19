import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    background_color: "#f5f7f6",
    description: "날짜별 현대모비스 파츠 주문을 기록하고 여러 기기에서 함께 확인합니다.",
    display: "standalone",
    icons: [
      {
        src: "/pwa-icon/192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/pwa-icon/512",
        sizes: "512x512",
        type: "image/png",
      },
      {
        purpose: "maskable",
        src: "/pwa-icon/512",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    id: "/",
    lang: "ko-KR",
    name: "모비스 주문장",
    orientation: "portrait-primary",
    scope: "/",
    short_name: "모비스 주문",
    start_url: "/",
    theme_color: "#265f47",
  };
}
