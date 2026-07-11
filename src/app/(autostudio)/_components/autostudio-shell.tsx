'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DateRangeProvider } from '@/lib/dateRangeStore';
import { NavigationTabs } from './navigation-tabs';

const DESKTOP_CANVAS_WIDTH = 1120;

export function AutoStudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [shellState, setShellState] = useState({
    isReady: false,
    isMobileViewport: false,
    isDesktopFrame: false,
    desktopFrameSrc: '',
    mobileScale: 1,
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 767px)');

    const syncShellState = () => {
      const params = new URLSearchParams(window.location.search);
      const isDesktopFrame = params.get('__autostudio_desktop') === '1';
      params.set('__autostudio_desktop', '1');
      const query = params.toString();

      setIsSidebarCollapsed(window.localStorage.getItem('autostudio-sidebar-collapsed') === '1');
      setShellState({
        isReady: true,
        isMobileViewport: mediaQuery.matches,
        isDesktopFrame,
        desktopFrameSrc: `${window.location.pathname}${query ? `?${query}` : ''}`,
        mobileScale: Math.min(1, window.innerWidth / DESKTOP_CANVAS_WIDTH),
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

  const toggleSidebar = () => {
    setIsSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem('autostudio-sidebar-collapsed', next ? '1' : '0');
      return next;
    });
  };

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

          <main className="h-[calc(100dvh-48px)] overflow-hidden bg-transparent">
            <iframe
              key={shellState.desktopFrameSrc}
              title="AutoStudio desktop view"
              src={shellState.desktopFrameSrc}
              className="block border-0 bg-transparent"
              style={{
                width: DESKTOP_CANVAS_WIDTH,
                height: `calc((100dvh - 48px) / ${shellState.mobileScale})`,
                transform: `scale(${shellState.mobileScale})`,
                transformOrigin: 'top left',
              }}
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
          <aside
            className={`sticky top-0 flex h-screen shrink-0 overflow-y-auto border-r border-[color:var(--color-border)] bg-white transition-[width] duration-200 ${
              isSidebarCollapsed ? 'w-[72px]' : 'w-[240px]'
            }`}
          >
            <div className={`flex h-full flex-col gap-6 ${isSidebarCollapsed ? 'items-center px-3 py-6' : 'px-6 py-8'}`}>
              <div className={`flex items-center ${isSidebarCollapsed ? 'flex-col gap-3' : 'gap-3'}`}>
                <Link
                  href="/home"
                  prefetch={false}
                  className={`flex items-center text-lg font-semibold text-[color:var(--color-text-primary)] ${
                    isSidebarCollapsed ? 'justify-center' : 'gap-3'
                  }`}
                  title="AutoStudio"
                >
                  <img src="/icon.png" alt="AutoStudio" className="h-10 w-10 rounded-lg" />
                  {!isSidebarCollapsed && (
                    <div className="flex flex-col items-start gap-1">
                      <span>AutoStudio</span>
                      <span className="text-xs font-medium uppercase tracking-[0.2em] text-[color:var(--color-text-muted)]">
                        Autopilot System
                      </span>
                    </div>
                  )}
                </Link>
                <button
                  type="button"
                  onClick={toggleSidebar}
                  aria-label={isSidebarCollapsed ? 'メニューを開く' : 'メニューを閉じる'}
                  title={isSidebarCollapsed ? 'メニューを開く' : 'メニューを閉じる'}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white text-sm font-semibold text-[color:var(--color-text-secondary)] transition-colors hover:bg-[#f2f2f2]"
                >
                  {isSidebarCollapsed ? '>>' : '<<'}
                </button>
              </div>
              {!isSidebarCollapsed && <NavigationTabs />}
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
