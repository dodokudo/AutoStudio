import type { HTMLAttributes } from 'react';
import { classNames } from '@/lib/classNames';

type BannerVariant = 'success' | 'warning' | 'error';

const variantClassName: Record<BannerVariant, string> = {
  success: 'ui-banner-success',
  warning: 'ui-banner-warning',
  error: 'ui-banner-error',
};

interface BannerProps extends HTMLAttributes<HTMLDivElement> {
  variant?: BannerVariant;
}

export function Banner({ variant = 'success', className, ...props }: BannerProps) {
  return <div className={classNames(variantClassName[variant], className)} {...props} />;
}
