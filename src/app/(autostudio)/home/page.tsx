import Link from 'next/link';
import { Card } from '@/components/ui/card';

const destinations = [
  { href: '/threads', title: 'Threads', description: '投稿管理とインサイト分析' },
  { href: '/instagram', title: 'Instagram', description: 'フィード・ストーリーの運用' },
  { href: '/youtube', title: 'YouTube', description: '動画台本と分析レポート' },
  { href: '/line', title: 'LINE', description: 'メッセージ配信とシナリオ管理' },
];

export default function HomePage() {
  return (
    <div className="section-stack">

      {/* Platform cards with subtle accent gradient */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {destinations.map((destination) => (
          <Link
            key={destination.href}
            href={destination.href}
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]"
          >
            <Card className="h-full transition-all duration-300 hover:shadow-[var(--shadow-elevated)] hover:scale-[1.02] accent-gradient">
              <h2 className="text-lg font-medium text-[color:var(--color-text-primary)]">{destination.title}</h2>
              <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">{destination.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
