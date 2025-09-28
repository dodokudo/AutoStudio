import type { HTMLAttributes, ReactNode } from 'react';
import { classNames } from '@/lib/classNames';

interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div className={classNames('ui-empty-state', className)} {...props}>
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
