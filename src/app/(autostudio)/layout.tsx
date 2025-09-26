import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ThemeToggle } from './_components/theme-toggle';

export default function AutoStudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="sticky top-6 z-40 mx-auto max-w-6xl px-6">
        <div className="rounded-3xl border border-white/60 bg-white/70 p-4 shadow-[0_20px_45px_rgba(125,145,211,0.25)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/10">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <Link href="/threads" className="flex items-center gap-3 text-lg font-semibold text-slate-900 transition hover:text-indigo-600 dark:text-white">
              <span className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-white">
                <Image src="/autostudio-logo.svg" alt="AutoStudio" width={44} height={44} className="h-full w-full object-contain" priority />
              </span>
              <div className="leading-tight">
                <span className="block text-base font-semibold">AutoStudio</span>
                <span className="text-[11px] font-medium uppercase tracking-[0.26em] text-slate-400 dark:text-slate-500">Autopilot System</span>
              </div>
            </Link>
            <nav className="flex flex-wrap items-center gap-2 text-sm text-slate-500 dark:text-slate-300">
              <Link
                href="/threads"
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 transition bg-white/80 text-slate-600 shadow-sm shadow-indigo-100/40 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                Threads
              </Link>
              <Link
                href="/line"
                className="inline-flex items-center gap-2 rounded-full px-4 py-2 transition bg-white/80 text-slate-600 shadow-sm shadow-indigo-100/40 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              >
                LINE
              </Link>
              <span className="cursor-not-allowed bg-slate-200/60 text-slate-400 dark:bg-white/5 dark:text-slate-500 inline-flex items-center gap-2 rounded-full px-4 py-2 transition">
                YouTube
              </span>
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
