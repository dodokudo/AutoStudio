'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { classNames } from '@/lib/classNames';

export type LinksTabKey = 'manage' | 'insights';

interface TabItem {
  id: LinksTabKey;
  label: string;
  href: string;
}

interface LinksTabShellProps {
  tabItems: TabItem[];
  activeTab: LinksTabKey;
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}

export function LinksTabShell({ tabItems, activeTab, toolbar, children }: LinksTabShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingTab, setPendingTab] = useState<LinksTabKey | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSelect = useCallback(
    (item: TabItem) => {
      if (item.id === activeTab || isPending) {
        return;
      }
      setPendingTab(item.id);
      startTransition(() => {
        router.push(`${pathname}${item.href}`, { scroll: false });
      });
    },
    [activeTab, isPending, pathname, router],
  );

  return (
    <div className="section-stack">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <nav className="flex flex-wrap items-end gap-1">
          {tabItems.map((item) => {
            const isActive = item.id === activeTab;
            const isTarget = item.id === pendingTab;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item)}
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
        {toolbar ?? null}
      </div>

      <div className={classNames('transition-opacity', isPending ? 'opacity-60' : 'opacity-100')}>
        {children}
      </div>
    </div>
  );
}
