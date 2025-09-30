import type { HTMLAttributes } from 'react';
import { classNames } from '@/lib/classNames';

type CardVariant = 'default' | 'muted';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

export function Card({ variant = 'default', className, ...props }: CardProps) {
  const baseClass = variant === 'muted' ? 'ui-card-muted' : 'ui-card';
  return <div className={classNames(baseClass, 'max-w-full', className)} {...props} />;
}
