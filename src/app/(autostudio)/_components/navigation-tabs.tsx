"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { id: "home", href: "/home", label: "Home" },
  { id: "threads", href: "/threads", label: "Threads" },
  { id: "instagram", href: "/instagram", label: "Instagram" },
  { id: "youtube", href: "/youtube", label: "YouTube" },
  { id: "line", href: "/line", label: "LINE" },
];

export function NavigationTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-300">
      {navItems.map((item) => {
        const isActive = pathname?.startsWith(item.href);
        const base = isActive
          ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_14px_28px_rgba(111,126,252,0.35)]"
          : "bg-white/80 text-slate-600 shadow-sm shadow-indigo-100/40 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10";

        return (
          <Link
            key={item.id}
            href={item.href}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 transition ${base}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
