import type { ReactNode } from 'react';
import Link from 'next/link';
import { ThemeToggle } from './_components/theme-toggle';

const navItems = [
  { id: 'threads', href: '/threads', label: 'Threads' },
  { id: 'line', href: '/line', label: 'LINE' },
  { id: 'youtube', href: '#', label: 'YouTube (coming soon)' },
  { id: 'instagram', href: '#', label: 'Instagram (coming soon)' },
];

export default function AutoStudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="sticky top-6 z-40 mx-auto max-w-6xl px-6">
        <div className="rounded-3xl border border-white/60 bg-white/70 p-4 shadow-[0_20px_45px_rgba(125,145,211,0.25)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/threads" className="text-lg font-semibold text-slate-900 dark:text-white">
              AutoStudio
            </Link>
            <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-300">
              {navItems.map((item) => {
                const isDisabled = item.href === '#';
                return (
                  <Link
                    key={item.id}
                    href={isDisabled ? '/threads' : item.href}
                    aria-disabled={isDisabled}
                    className={`inline-flex items-center gap-2 rounded-full px-4 py-2 transition ${
                      isDisabled
                        ? 'cursor-not-allowed bg-slate-200/60 text-slate-400 dark:bg-white/5 dark:text-slate-500'
                        : 'bg-white/80 text-slate-600 shadow-sm shadow-indigo-100/40 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10'
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="flex items-center gap-3 text-slate-500">
              <span className="hidden text-xs font-medium sm:inline text-slate-600 dark:text-slate-200">Hi, kudooo</span>
              <div className="hidden h-9 w-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 shadow-lg sm:block" />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto mt-16 w-full max-w-6xl px-6 pb-16">{children}</main>
    </div>
  );
}
