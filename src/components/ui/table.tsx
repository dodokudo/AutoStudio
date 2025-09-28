import type { TableHTMLAttributes } from 'react';
import { classNames } from '@/lib/classNames';

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={classNames('ui-table', className)} {...props} />;
}
