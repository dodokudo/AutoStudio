"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { classNames } from '@/lib/classNames';

const navItems = [
  { id: 'top', href: '/home', label: 'Top' },
  { id: 'threads', href: '/threads', label: 'Threads' },
  { id: 'instagram', href: '/instagram', label: 'Instagram' },
  { id: 'ads', href: '/ads', label: 'Ads' },
  { id: 'youtube', href: '/youtube', label: 'YouTube' },
  { id: 'line', href: '/line', label: 'LINE' },
  { id: 'sales', href: '/sales', label: 'Sales' },
  { id: 'links', href: '/links', label: 'Links' },
];

export function NavigationTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-2 overflow-x-auto text-sm scrollbar-hide md:flex-col md:items-stretch md:gap-1 md:overflow-visible">
      {navItems.map((item) => {
        const isActive = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.id}
            href={item.href}
            className={classNames(
              'inline-flex h-10 items-center whitespace-nowrap rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white px-4 font-medium text-[color:var(--color-text-secondary)] transition-colors hover:bg-[#f2f2f2] flex-shrink-0',
              'md:h-10 md:w-full md:justify-start md:px-3 md:text-sm',
              isActive &&
                'border-[color:var(--color-accent)] bg-[color:var(--color-text-primary)] text-white hover:bg-[color:var(--color-text-primary)]',
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
