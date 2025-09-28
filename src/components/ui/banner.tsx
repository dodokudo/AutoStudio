import type { HTMLAttributes } from 'react';
import { classNames } from '@/lib/classNames';

type BannerVariant = 'success' | 'warning' | 'error';

const variantClassName: Record<BannerVariant, string> = {
  success: 'rounded-[var(--radius-md)] border px-4 py-3 text-sm bg-[#e6f7ed] border-[#b5eed3] text-[#096c3e]',
  warning: 'rounded-[var(--radius-md)] border px-4 py-3 text-sm bg-[#fff7e6] border-[#ffe0a3] text-[#ad6800]',
  error: 'rounded-[var(--radius-md)] border px-4 py-3 text-sm bg-[#fdeded] border-[#f2b8b5] text-[#a61b1b]',
};

interface BannerProps extends HTMLAttributes<HTMLDivElement> {
  variant?: BannerVariant;
}

export function Banner({ variant = 'success', className, ...props }: BannerProps) {
  return <div className={classNames(variantClassName[variant], className)} {...props} />;
}
