'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DateRangeProvider } from '@/lib/dateRangeStore';
import { NavigationIconRail, NavigationTabs, SidebarToggleIcon } from './navigation-tabs';

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
            className={`sticky top-0 flex h-screen shrink-0 overflow-y-auto border-r border-[color:var(--color-border)] transition-[width] duration-200 ${
              isSidebarCollapsed ? 'w-[88px] bg-white/60 backdrop-blur-md' : 'w-[240px] bg-white'
            }`}
          >
            <div className={`flex h-full w-full flex-col gap-5 ${isSidebarCollapsed ? 'px-1.5 py-5' : 'px-6 py-8'}`}>
              <div className={isSidebarCollapsed ? 'flex flex-col items-center' : 'flex items-center justify-between gap-2'}>
                {isSidebarCollapsed ? (
                  <button
                    type="button"
                    onClick={toggleSidebar}
                    aria-label="メニューを開く"
                    title="メニューを開く"
                    className="group relative flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] transition-colors hover:bg-black/5"
                  >
                    <img
                      src="/icon.png"
                      alt="AutoStudio"
                      className="h-9 w-9 rounded-lg transition-opacity duration-150 group-hover:opacity-0"
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-[color:var(--color-text-secondary)] opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                      <SidebarToggleIcon collapsed={true} />
                    </span>
                  </button>
                ) : (
                  <>
                    <Link
                      href="/home"
                      prefetch={false}
                      className="flex items-center gap-2.5 text-lg font-semibold text-[color:var(--color-text-primary)]"
                      title="AutoStudio"
                    >
                      <img src="/icon.png" alt="AutoStudio" className="h-9 w-9 rounded-lg" />
                      <span>AutoStudio</span>
                    </Link>
                    <button
                      type="button"
                      onClick={toggleSidebar}
                      aria-label="メニューを閉じる"
                      title="メニューを閉じる"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[color:var(--color-text-muted)] transition-colors hover:bg-black/5 hover:text-[color:var(--color-text-secondary)]"
                    >
                      <SidebarToggleIcon collapsed={false} />
                    </button>
                  </>
                )}
              </div>
              {isSidebarCollapsed ? <NavigationIconRail /> : <NavigationTabs />}
            </div>
          </aside>

          <main className="min-w-0 flex-1 overflow-visible pb-10 pt-6 [&_.page-container]:ml-0 [&_.page-container]:mr-auto">
            <div className="page-container px-8">{children}</div>
          </main>
        </div>
      </div>
    </DateRangeProvider>
  );
}
