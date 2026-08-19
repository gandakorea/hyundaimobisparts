import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import PwaRegister from "./pwa-register";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "모비스 주문장",
  title: "현대모비스 주문 파츠 기록장",
  description: "날짜별 현대모비스 파츠넘버와 원화 가격을 정리하는 주문 기록장입니다.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "모비스 주문",
  },
  icons: {
    apple: "/apple-icon",
    icon: [{ url: "/icon", type: "image/png" }, { url: "/favicon.svg" }],
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  initialScale: 1,
  themeColor: "#265f47",
  viewportFit: "cover",
  width: "device-width",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
