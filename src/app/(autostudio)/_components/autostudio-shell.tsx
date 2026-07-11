'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DateRangeProvider } from '@/lib/dateRangeStore';
import { NavigationTabs } from './navigation-tabs';

export function AutoStudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [shellState, setShellState] = useState({
    isReady: false,
    isMobileViewport: false,
    isDesktopFrame: false,
    desktopFrameSrc: '',
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');

    const syncShellState = () => {
      const params = new URLSearchParams(window.location.search);
      const isDesktopFrame = params.get('__autostudio_desktop') === '1';
      params.set('__autostudio_desktop', '1');
      const query = params.toString();

      setShellState({
        isReady: true,
        isMobileViewport: mediaQuery.matches,
        isDesktopFrame,
        desktopFrameSrc: `${window.location.pathname}${query ? `?${query}` : ''}`,
      });
    };

    syncShellState();
    mediaQuery.addEventListener('change', syncShellState);
    window.addEventListener('popstate', syncShellState);
    return () => {
      mediaQuery.removeEventListener('change', syncShellState);
      window.removeEventListener('popstate', syncShellState);
    };
  }, [pathname]);

  if (!shellState.isReady) {
    return (
      <DateRangeProvider>
        <div className="min-h-screen bg-gradient-to-r from-pink-50/70 via-blue-50/50 to-teal-50/30" />
      </DateRangeProvider>
    );
  }

  if (shellState.isDesktopFrame) {
    return (
      <DateRangeProvider>
        <main className="min-h-screen bg-gradient-to-r from-pink-50/70 via-blue-50/50 to-teal-50/30 pb-10 pt-8 text-[color:var(--color-text-primary)]">
          <div className="page-container w-[1120px] px-8">{children}</div>
        </main>
      </DateRangeProvider>
    );
  }

  if (shellState.isMobileViewport) {
    return (
      <DateRangeProvider>
        <div className="min-h-screen bg-gradient-to-r from-pink-50/70 via-blue-50/50 to-teal-50/30 text-[color:var(--color-text-primary)]">
          <header className="sticky top-0 z-40 border-b border-[color:var(--color-border)] bg-white">
            <div className="flex h-12 w-full items-center justify-between gap-2 px-2">
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

          <main className="overflow-x-auto overscroll-x-contain bg-transparent">
            <iframe
              key={shellState.desktopFrameSrc}
              title="AutoStudio desktop view"
              src={shellState.desktopFrameSrc}
              className="block h-[calc(100dvh-48px)] w-[1120px] border-0 bg-transparent"
            />
          </main>
        </div>
      </DateRangeProvider>
    );
  }

  return (
    <DateRangeProvider>
      <div className="flex min-h-screen flex-col bg-gradient-to-r from-pink-50/70 via-blue-50/50 to-teal-50/30 text-[color:var(--color-text-primary)]">
        <div className="flex w-full flex-1 flex-row gap-0 px-0">
          <aside className="sticky top-0 flex h-screen min-w-[220px] max-w-[240px] overflow-y-auto border-r border-[color:var(--color-border)] bg-white">
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

          <main className="min-w-0 flex-1 overflow-visible pb-10 pt-12">
            <div className="page-container px-8">{children}</div>
          </main>
        </div>
      </div>
    </DateRangeProvider>
  );
}
