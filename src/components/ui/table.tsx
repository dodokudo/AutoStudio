import type { TableHTMLAttributes } from 'react';
import { classNames } from '@/lib/classNames';

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={classNames('w-full table-auto border border-[color:var(--color-border)] rounded-[var(--radius-md)] overflow-hidden text-sm text-[color:var(--color-text-secondary)]', className)} {...props} />;
}
