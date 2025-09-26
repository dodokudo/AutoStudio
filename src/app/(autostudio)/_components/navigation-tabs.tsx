"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { id: "threads", href: "/threads", label: "Threads" },
  { id: "line", href: "/line", label: "LINE" },
  { id: "youtube", href: "#", label: "YouTube" },
  { id: "instagram", href: "#", label: "Instagram" },
];

export function NavigationTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-300">
      {navItems.map((item) => {
        const disabled = item.href === "#";
        const isActive = !disabled && pathname?.startsWith(item.href);
        const base = disabled
          ? "cursor-not-allowed bg-slate-200/60 text-slate-400 dark:bg-white/5 dark:text-slate-500"
          : isActive
            ? "bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-[0_14px_28px_rgba(111,126,252,0.35)]"
            : "bg-white/80 text-slate-600 shadow-sm shadow-indigo-100/40 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10";

        return (
          <Link
            key={item.id}
            href={disabled ? "/threads" : item.href}
            aria-disabled={disabled}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 transition ${base}`}
          >
            {item.label}
            {disabled ? (
              <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">soon</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
