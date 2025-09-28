import { Card } from '@/components/ui/card';

interface DashboardCardsProps {
  jobCounts: {
    pending: number;
    processing: number;
    failed: number;
    succeededToday: number;
  };
  recentLogs: Array<{
    jobId: string;
    planId: string;
    status: string;
    postedThreadId?: string;
    errorMessage?: string;
    postedAt?: string;
  }>;
}

const statusClass: Record<string, string> = {
  succeeded: 'bg-[#e6f7ed] text-[#096c3e]',
  failed: 'bg-[#fdeded] text-[#a61b1b]',
  processing: 'bg-[#e6f4ff] text-[#0a5dc2]',
  pending: 'bg-[#fff4e5] text-[#ad6800]',
};

export function DashboardCards({ jobCounts, recentLogs }: DashboardCardsProps) {
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
        <header className="flex items-center justify-between text-sm">
          <h3 className="font-semibold text-[color:var(--color-text-primary)]">最近の投稿ログ</h3>
          <span className="text-xs text-[color:var(--color-text-muted)]">最新10件</span>
        </header>
        <div className="mt-4 space-y-3 text-sm text-[color:var(--color-text-secondary)]">
          {recentLogs.length === 0 ? (
            <p className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-5 text-center text-sm text-[color:var(--color-text-muted)]">
              投稿ログはまだありません。
            </p>
          ) : (
            recentLogs.map((log) => (
              <div
                key={`${log.jobId}-${log.postedAt ?? 'na'}`}
                className="grid gap-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4 shadow-[var(--shadow-soft)] md:grid-cols-[1.4fr,1fr,1fr]"
              >
                <div>
                  <p className="text-sm font-medium text-[color:var(--color-text-primary)]">Plan {log.planId}</p>
                  <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">Job {log.jobId}</p>
                </div>
                <div className="flex flex-col gap-1 text-xs">
                  <span
                    className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 font-medium ${
                      statusClass[log.status] ?? 'bg-[#f2f4f7] text-[color:var(--color-text-muted)]'
                    }`}
                  >
                    {log.status}
                  </span>
                  {log.postedThreadId ? <span>Thread ID: {log.postedThreadId}</span> : null}
                  {log.errorMessage ? <span className="text-[#a61b1b]">{log.errorMessage}</span> : null}
                </div>
                <div className="text-xs text-[color:var(--color-text-muted)]">
                  {log.postedAt ? new Date(log.postedAt).toLocaleString() : '—'}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </section>
  );
}
