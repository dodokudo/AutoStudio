'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { DateRangeProvider } from '@/lib/dateRangeStore';
import { NavigationTabs } from './navigation-tabs';

export function AutoStudioShell({ children }: { children: ReactNode }) {
  return (
    <DateRangeProvider>
      <div className="flex min-h-screen flex-col bg-gradient-to-r from-pink-50/70 via-blue-50/50 to-teal-50/30 text-[color:var(--color-text-primary)]">
        {/* Mobile header remains across small screens */}
        <header className="autostudio-mobile-topbar sticky top-0 z-40 border-b border-[color:var(--color-border)] bg-white md:hidden">
          <div className="page-container flex h-11 items-center justify-between gap-2 px-2">
            <Link
              href="/home"
              prefetch={false}
              className="flex shrink-0 items-center gap-2 text-sm font-semibold text-[color:var(--color-text-primary)]"
            >
              <img src="/icon.png" alt="AutoStudio" className="h-7 w-7 rounded-md" />
              <span className="text-sm">AutoStudio</span>
            </Link>
            <NavigationTabs />
          </div>
        </header>

        <div className="flex w-full flex-1 flex-col gap-0 px-0 md:flex-row md:gap-0 md:px-0">
          {/* Desktop sidebar navigation */}
          <aside className="autostudio-sidebar sticky top-0 hidden h-screen min-w-[220px] max-w-[240px] overflow-y-auto border-r border-[color:var(--color-border)] bg-white md:flex">
            <div className="flex h-full flex-col gap-6 px-6 py-8">
              <Link
                href="/home"
                prefetch={false}
                className="flex items-center gap-3 text-lg font-semibold text-[color:var(--color-text-primary)]"
              >
                <img src="/icon.png" alt="AutoStudio" className="h-10 w-10 rounded-lg" />
                <div className="flex flex-col items-start gap-1">
                  <span>AutoStudio</span>
                  <span className="text-xs font-medium uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                    Autopilot System
                  </span>
                </div>
              </Link>
              <NavigationTabs />
            </div>
          </aside>

          <main className="min-w-0 flex-1 overflow-x-auto pb-6 pt-3 md:overflow-visible md:pb-10 md:pt-12">
            <div className="page-container min-w-[1120px] px-3 md:min-w-0 md:px-8">{children}</div>
          </main>
        </div>
      </div>
    </DateRangeProvider>
  );
}
