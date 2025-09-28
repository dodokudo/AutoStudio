"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { id: 'home', href: '/home', label: 'Home' },
  { id: 'threads', href: '/threads', label: 'Threads' },
  { id: 'instagram', href: '/instagram', label: 'Instagram' },
  { id: 'youtube', href: '/youtube', label: 'YouTube' },
  { id: 'line', href: '/line', label: 'LINE' },
];

export function NavigationTabs() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm">
      {navItems.map((item) => {
        const isActive = pathname?.startsWith(item.href);
        return (
          <Link
            key={item.id}
            href={item.href}
            className={
              isActive
                ? 'inline-flex h-10 items-center rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-text-primary)] px-4 font-medium text-white transition-colors'
                : 'inline-flex h-10 items-center rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white px-4 font-medium text-[color:var(--color-text-secondary)] transition-colors hover:bg-[#f2f2f2]'
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
