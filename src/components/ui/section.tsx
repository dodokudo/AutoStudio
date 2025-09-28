import type { HTMLAttributes } from 'react';
import { classNames } from '@/lib/classNames';

export function Section({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={classNames('ui-card', className)} {...props} />;
}
