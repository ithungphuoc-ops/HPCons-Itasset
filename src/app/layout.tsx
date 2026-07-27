import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "ITAsset — Quản lý tài sản IT",
  description: "Hệ thống quản lý tài sản IT nội bộ",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* Bong bóng góp ý/báo lỗi xuyên suốt hệ sinh thái (27/07/2026) — file
            phục vụ từ app tổng, đọc cookie SSO .hpcore.vn có sẵn để xác
            thực, không cần code riêng ở đây ngoài đúng 1 dòng này. */}
        <script src="https://account.hpcore.vn/feedback-widget.js" data-app="ITAsset" async />
      </body>
    </html>
  );
}
