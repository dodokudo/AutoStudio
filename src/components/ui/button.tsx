'use client';

import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { classNames } from '@/lib/classNames';

type ButtonVariant = 'primary' | 'secondary' | 'link';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClassName: Record<ButtonVariant, string> = {
  primary: 'inline-flex items-center justify-center rounded-[var(--radius-md)] px-4 h-10 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 text-white bg-[color:var(--color-text-primary)] hover:bg-[#0e0f10] focus-visible:outline-[color:var(--color-accent)] disabled:bg-[#bfc2c5] disabled:text-[#f5f5f5]',
  secondary: 'inline-flex items-center justify-center rounded-[var(--radius-md)] px-4 h-10 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 bg-white border border-[color:var(--color-border)] text-[color:var(--color-text-primary)] hover:bg-[#f2f2f2] focus-visible:outline-[color:var(--color-accent)] disabled:text-[#9da1a8]',
  link: 'inline-flex items-center justify-center h-auto px-0 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 text-[color:var(--color-accent)] bg-transparent hover:text-[color:var(--color-accent-hover)] focus-visible:outline-[color:var(--color-accent)] disabled:text-[#a3b4d8]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={classNames(variantClassName[variant], className)}
      {...props}
    />
  );
});
