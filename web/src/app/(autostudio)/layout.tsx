import type { ReactNode } from 'react';
import Link from 'next/link';

const navItems = [
  { id: 'threads', href: '/threads', label: 'Threads' },
  { id: 'line', href: '/line', label: 'LINE' },
  { id: 'youtube', href: '#', label: 'YouTube (coming soon)' },
  { id: 'instagram', href: '#', label: 'Instagram (coming soon)' },
];

export default function AutoStudioLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/threads" className="text-lg font-semibold tracking-tight">
            AutoStudio
          </Link>
          <nav className="flex items-center gap-6 text-sm text-slate-300">
            {navItems.map((item) => (
              <Link
                key={item.id}
                href={item.href === '#' ? '/threads' : item.href}
                className={
                  item.href === '#'
                    ? 'cursor-not-allowed opacity-50'
                    : 'transition hover:text-white'
                }
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
