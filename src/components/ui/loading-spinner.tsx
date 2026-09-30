import { classNames } from '@/lib/classNames';

const sizes = { sm: 18, md: 24, lg: 36 };

export function LoadingSpinner({
  size = 'md',
  label = '読み込み中',
  className,
}: {
  size?: keyof typeof sizes;
  label?: string;
  className?: string;
}) {
  return (
    <span
      role="status"
      className={classNames(
        'inline-flex shrink-0 items-center justify-center align-middle text-[color:var(--color-accent)]',
        className
      )}
    >
      <svg
        aria-hidden="true"
        width={sizes[size]}
        height={sizes[size]}
        viewBox="0 0 24 24"
        fill="none"
        className="overflow-visible animate-spin motion-reduce:animate-none"
        style={{ animationDuration: '900ms' }}
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.14" />
        <path
          d="M12 3a9 9 0 0 1 9 9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 3px var(--color-accent))' }}
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}
