'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { NavigationTabs } from './_components/navigation-tabs';
import { DateRangeProvider } from '@/lib/dateRangeStore';

export default function AutoStudioLayout({ children }: { children: ReactNode }) {
  return (
    <DateRangeProvider>
      <div className="min-h-screen bg-[color:var(--color-background)]">
        <header className="border-b border-[color:var(--color-border)] bg-white">
          <div className="page-container flex h-16 items-center justify-between gap-3 md:gap-6">
            <Link href="/home" className="flex items-center gap-2 md:gap-3 text-base font-semibold text-[color:var(--color-text-primary)]">
              <span className="text-base md:text-lg">AutoStudio</span>
              <span className="hidden md:inline text-xs font-medium uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">Autopilot System</span>
            </Link>
            <NavigationTabs />
          </div>
        </header>
        <main className="page-container py-6 md:py-12">{children}</main>
      </div>
    </DateRangeProvider>
  );
}
