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
      <Card className="text-center">
        <h1 className="text-3xl font-semibold text-[color:var(--color-text-primary)]">AutoStudio</h1>
        <p className="mt-3 text-base text-[color:var(--color-text-secondary)]">
          自動投稿システムへようこそ。管理したいプラットフォームを選び、各タブから機能を利用してください。
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {destinations.map((destination) => (
          <Link
            key={destination.href}
            href={destination.href}
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]"
          >
            <Card className="h-full transition-shadow hover:shadow-[0_16px_32px_rgba(12,16,20,0.08)]">
              <h2 className="text-lg font-medium text-[color:var(--color-text-primary)]">{destination.title}</h2>
              <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">{destination.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
