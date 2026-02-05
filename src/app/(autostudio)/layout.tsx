'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { NavigationTabs } from './_components/navigation-tabs';
import { DateRangeProvider } from '@/lib/dateRangeStore';

export default function AutoStudioLayout({ children }: { children: ReactNode }) {
  return (
    <DateRangeProvider>
      <div className="min-h-screen bg-gradient-to-r from-pink-50/70 via-blue-50/50 to-teal-50/30 text-[color:var(--color-text-primary)]">
        {/* Mobile header remains across small screens */}
        <header className="border-b border-[color:var(--color-border)] bg-white md:hidden">
          <div className="page-container flex h-16 items-center justify-between gap-3">
            <Link
              href="/home"
              className="flex items-center gap-2.5 text-base font-semibold text-[color:var(--color-text-primary)]"
            >
              <img src="/icon.png" alt="AutoStudio" className="h-9 w-9 rounded-lg" />
              <div className="flex flex-col items-start">
                <span className="text-base">AutoStudio</span>
                <span className="mt-0.5 text-xs font-medium uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                  Autopilot System
                </span>
              </div>
            </Link>
            <NavigationTabs />
          </div>
        </header>

        <div className="flex w-full flex-1 flex-col gap-0 px-0 md:flex-row md:gap-0 md:px-0">
          {/* Desktop sidebar navigation */}
          <aside className="sticky top-0 hidden h-screen min-w-[220px] max-w-[240px] overflow-y-auto border-r border-[color:var(--color-border)] bg-white md:flex">
            <div className="flex h-full flex-col gap-6 px-6 py-8">
              <Link
                href="/home"
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

          <main className="flex-1 pb-10 pt-6 md:py-12">
            <div className="page-container md:mx-0 md:px-0">{children}</div>
          </main>
        </div>
      </div>
    </DateRangeProvider>
  );
}
