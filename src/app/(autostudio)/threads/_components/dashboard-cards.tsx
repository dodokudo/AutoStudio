import { Card } from '@/components/ui/card';

interface DashboardCardsProps {
  jobCounts: {
    pending: number;
    processing: number;
    failed: number;
    succeededToday: number;
  };
}

export function DashboardCards({ jobCounts }: DashboardCardsProps) {
  const overview = [
    { label: 'Pending', value: jobCounts.pending },
    { label: 'Processing', value: jobCounts.processing },
    { label: 'Failed', value: jobCounts.failed },
    { label: 'Succeeded Today', value: jobCounts.succeededToday },
  ];

  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {overview.map((card) => (
          <div key={card.label} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4 text-sm shadow-[var(--shadow-soft)]">
            <p className="text-xs font-medium text-[color:var(--color-text-secondary)] uppercase tracking-[0.08em]">
              {card.label}
            </p>
            <p className="mt-3 text-2xl font-semibold text-[color:var(--color-text-primary)]">{card.value}</p>
          </div>
        ))}
      </div>

      <Card>
        <div className="space-y-1 text-sm text-[color:var(--color-text-secondary)]">
          <h3 className="font-semibold text-[color:var(--color-text-primary)]">投稿オペレーションの状況</h3>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            最新の投稿結果は下部の「投稿済みコンテンツ」で確認できます。
          </p>
        </div>
      </Card>
    </section>
  );
}
