"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { classNames } from '@/lib/classNames';

const navItems = [
  { id: 'top', href: '/home', label: 'Top', icon: '🏠' },
  { id: 'threads', href: '/threads', label: 'Threads', icon: '🧵' },
  { id: 'instagram', href: '/instagram', label: 'Instagram', icon: '📸' },
  { id: 'line', href: '/line', label: 'LINE', icon: '💬' },
  { id: 'analyca', href: '/analyca', label: 'ANALYCA', icon: '📊' },
  { id: 'launch', href: '/launch', label: 'Launch', icon: '🚀' },
  { id: 'sales', href: '/sales', label: 'Sales', icon: '¥' },
  { id: 'ads', href: '/ads', label: 'Ads', icon: '📣' },
  { id: 'youtube', href: '/youtube', label: 'YouTube', icon: '▶' },
  { id: 'links', href: '/links', label: 'リンク計測', icon: '🔗' },
  { id: 'launchkit', href: '/launchkit', label: 'LaunchKit', icon: '🧩' },
  { id: 'agency', href: '/agency', label: 'agency', icon: '🤝' },
];;

export function NavigationTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-xs scrollbar-hide md:flex-none md:flex-col md:items-stretch md:gap-1 md:overflow-visible md:text-sm">
      {navItems.map((item) => {
        const isActive = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.id}
            href={item.href}
            prefetch={false}
            className={classNames(
              'inline-flex h-8 flex-shrink-0 items-center whitespace-nowrap rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-2.5 font-medium text-[color:var(--color-text-secondary)] transition-colors hover:bg-[#f2f2f2]',
              'md:h-10 md:w-full md:justify-start md:rounded-[var(--radius-md)] md:px-3 md:text-sm',
              isActive &&
                'border-[color:var(--color-accent)] max-md:bg-[color:var(--color-text-primary)] max-md:text-white max-md:hover:bg-[color:var(--color-text-primary)]',
              isActive && 'md:bg-[color:var(--color-accent-muted)] md:text-[color:var(--color-accent-dark)] md:shadow-[var(--shadow-soft)]'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function NavigationIconRail() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col items-center gap-2" aria-label="AutoStudio navigation">
      {navItems.map((item) => {
        const isActive = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.id}
            href={item.href}
            prefetch={false}
            title={item.label}
            aria-label={item.label}
            className={classNames(
              'inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white text-lg font-semibold text-[color:var(--color-text-secondary)] transition-colors hover:bg-[#f2f2f2]',
              isActive && 'border-[color:var(--color-accent)] bg-[color:var(--color-accent-muted)] text-[color:var(--color-accent-dark)] shadow-[var(--shadow-soft)]'
            )}
          >
            <span aria-hidden="true">{item.icon}</span>
          </Link>
        );
      })}
    </nav>
  );
}
