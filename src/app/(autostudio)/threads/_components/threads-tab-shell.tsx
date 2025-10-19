'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';

import { PageSkeleton } from '@/components/ui/page-skeleton';
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

const TAB_SKELETON_SECTIONS: Record<ThreadsTabKey, number> = {
  post: 4,
  insights: 4,
  competitor: 3,
};

export function ThreadsTabShell({ tabItems, activeTab, rangeSelector, children }: ThreadsTabShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingTab, setPendingTab] = useState<ThreadsTabKey | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleTabSelect = useCallback(
    (item: TabItem) => {
      if (item.id === activeTab || isPending) return;
      setPendingTab(item.id);
      startTransition(() => {
        router.push(`${pathname}${item.href}`, { scroll: false });
      });
    },
    [activeTab, isPending, pathname, router],
  );

  const isNavigating = pendingTab !== null;
  const skeletonSections = useMemo(() => TAB_SKELETON_SECTIONS[pendingTab ?? activeTab], [activeTab, pendingTab]);

  return (
    <div className="section-stack" aria-busy={isNavigating || undefined}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <nav className="flex flex-wrap items-end gap-1">
          {tabItems.map((item) => {
            const isActive = item.id === activeTab;
            const isTarget = item.id === pendingTab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleTabSelect(item)}
                disabled={isPending && !isTarget}
                className={classNames(
                  'relative whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]',
                  isActive
                    ? 'text-[color:var(--color-accent)]'
                    : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]',
                  isPending && !isTarget ? 'cursor-wait opacity-60' : 'cursor-pointer',
                )}
              >
                {item.label}
                {isActive ? (
                  <span className="pointer-events-none absolute inset-x-4 bottom-0 h-[2px] rounded-full bg-[color:var(--color-accent)]" />
                ) : null}
                {isTarget && !isActive ? (
                  <span className="pointer-events-none absolute inset-x-4 bottom-0 h-[2px] rounded-full bg-[color:var(--color-accent)] animate-pulse" />
                ) : null}
              </button>
            );
          })}
        </nav>
        {rangeSelector ?? null}
      </div>

      {isNavigating ? (
        <PageSkeleton sections={skeletonSections} showFilters={false} />
      ) : (
        children
      )}
    </div>
  );
}
