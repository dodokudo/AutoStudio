import type { HTMLAttributes, ReactNode } from 'react';
import { classNames } from '@/lib/classNames';

interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div className={classNames('flex flex-col items-center gap-3 rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-6 py-10 text-center text-sm text-[color:var(--color-text-muted)]', className)} {...props}>
      <div>
        <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">{title}</p>
        {description ? (
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">{description}</p>
        ) : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
