'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';

import { classNames } from '@/lib/classNames';

type ThreadsTabKey = 'post' | 'insights' | 'competitor';

type TabItem = {
  id: ThreadsTabKey;
  label: string;
  href: string;
};

interface ThreadsTabShellProps {
  tabItems: TabItem[];
  activeTab: ThreadsTabKey;
  rangeSelector?: React.ReactNode;
  children: React.ReactNode;
}

export function ThreadsTabShell({ tabItems, activeTab, rangeSelector, children }: ThreadsTabShellProps) {
  const pathname = usePathname();

  const tabLinks = useMemo(
    () =>
      tabItems.map((item) => ({
        ...item,
        fullHref: `${pathname}${item.href}`,
      })),
    [tabItems, pathname],
  );

  return (
    <div className="section-stack">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <nav className="flex flex-wrap items-end gap-1">
          {tabLinks.map((item) => {
            const isActive = item.id === activeTab;
            return (
              <Link
                key={item.id}
                href={item.fullHref}
                prefetch={true}
                scroll={false}
                className={classNames(
                  'relative whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]',
                  isActive
                    ? 'text-[color:var(--color-accent)]'
                    : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]',
                )}
              >
                {item.label}
                {isActive ? (
                  <span className="pointer-events-none absolute inset-x-4 bottom-0 h-[2px] rounded-full bg-[color:var(--color-accent)]" />
                ) : null}
              </Link>
            );
          })}
        </nav>
        {rangeSelector ?? null}
      </div>

      {children}
    </div>
  );
}
