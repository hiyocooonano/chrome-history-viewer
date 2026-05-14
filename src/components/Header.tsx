'use client';
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "履歴グラフ" },
  { href: "/bookmarks", label: "ブックマーク" },
  { href: "/upload", label: "アップロード" },
];

export default function Header() {
  const pathname = usePathname();
  return (
    <header className="bg-[#1a73e8] px-4 py-2 flex items-center justify-between shrink-0">
      <h1 className="text-white font-semibold text-base">Chrome History Graph Explorer</h1>
      <nav className="flex gap-1">
        {NAV_ITEMS.map((item) => (
          <Link key={item.href} href={item.href}
            className={`px-3 py-1 rounded text-sm transition-colors ${
              pathname === item.href ? "bg-white/20 text-white font-medium" : "text-blue-100 hover:bg-white/10"
            }`}>{item.label}</Link>
        ))}
      </nav>
    </header>
  );
}
