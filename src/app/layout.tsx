import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chrome History Graph Explorer",
  description: "閲覧履歴をグラフ構造で可視化",
};

export default function RootLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full">
      <body className="h-full bg-gray-950 text-white">{children}</body>
    </html>
  );
}
