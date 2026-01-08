import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "旅行分帳 App",
  description: "輕量化的旅行記帳與分帳應用程式",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
