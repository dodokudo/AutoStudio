import Link from 'next/link';
import { classNames } from '@/lib/classNames';

export interface DashboardTabItem {
  id: string;
  label: string;
  href: string;
  disabled?: boolean;
}

interface DashboardTabsProps {
  items: DashboardTabItem[];
  value: string;
  className?: string;
  'aria-label'?: string;
}

export function DashboardTabs({ items, value, className, 'aria-label': ariaLabel }: DashboardTabsProps) {
  return (
    <div className={classNames('border-b border-[color:var(--color-border)]', className)}>
      <nav aria-label={ariaLabel ?? 'ダッシュボードタブ'} className="flex flex-wrap items-end gap-1">
        {items.map((item) => {
          const isActive = item.id === value;
          const content = (
            <span
              className={classNames(
                'relative inline-flex whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'text-[color:var(--color-accent)]'
                  : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]',
              )}
            >
              {item.label}
              {isActive ? (
                <span className="pointer-events-none absolute inset-x-4 bottom-0 h-[2px] rounded-full bg-[color:var(--color-accent)]" />
              ) : null}
            </span>
          );

          if (item.disabled) {
            return (
              <span
                key={item.id}
                className="cursor-not-allowed px-4 py-3 text-sm font-medium text-[color:var(--color-text-muted)] opacity-60"
              >
                {item.label}
              </span>
            );
          }

          const isExternal = item.href.startsWith('http');
          return isExternal ? (
            <a key={item.id} href={item.href} className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]">
              {content}
            </a>
          ) : (
            <Link
              key={item.id}
              href={item.href}
              className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]"
            >
              {content}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
