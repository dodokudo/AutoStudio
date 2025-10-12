'use client';

import { classNames } from '@/lib/classNames';

export interface DashboardTabItemInteractive {
  id: string;
  label: string;
  disabled?: boolean;
}

interface DashboardTabsInteractiveProps {
  items: DashboardTabItemInteractive[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  'aria-label'?: string;
}

export function DashboardTabsInteractive({
  items,
  value,
  onChange,
  className,
  'aria-label': ariaLabel,
}: DashboardTabsInteractiveProps) {
  return (
    <div className={classNames('border-b border-[color:var(--color-border)]', className)}>
      <nav aria-label={ariaLabel ?? 'ダッシュボードタブ'} className="flex flex-wrap items-end gap-1">
        {items.map((item) => {
          const isActive = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (!item.disabled && item.id !== value) {
                  onChange(item.id);
                }
              }}
              className={classNames(
                'relative whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]',
                isActive
                  ? 'text-[color:var(--color-accent)]'
                  : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]',
                item.disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
              )}
            >
              {item.label}
              {isActive ? (
                <span className="pointer-events-none absolute inset-x-4 bottom-0 h-[2px] rounded-full bg-[color:var(--color-accent)]" />
              ) : null}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
