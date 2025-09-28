import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { classNames } from '@/lib/classNames';

type ButtonVariant = 'primary' | 'secondary' | 'link';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClassName: Record<ButtonVariant, string> = {
  primary: 'ui-button-primary',
  secondary: 'ui-button-secondary',
  link: 'ui-button-link',
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
