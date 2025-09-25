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

const statusColor: Record<string, string> = {
  succeeded: 'text-emerald-600 bg-emerald-50',
  failed: 'text-rose-600 bg-rose-50',
  processing: 'text-sky-600 bg-sky-50',
  pending: 'text-amber-600 bg-amber-50',
};

export function DashboardCards({ jobCounts, recentLogs }: DashboardCardsProps) {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: 'Pending', value: jobCounts.pending, tone: 'text-amber-600', glow: 'rgba(251,191,36,0.2)' },
          { label: 'Processing', value: jobCounts.processing, tone: 'text-sky-600', glow: 'rgba(56,189,248,0.25)' },
          { label: 'Failed', value: jobCounts.failed, tone: 'text-rose-600', glow: 'rgba(244,63,94,0.18)' },
          {
            label: 'Succeeded Today',
            value: jobCounts.succeededToday,
            tone: 'text-emerald-600',
            glow: 'rgba(16,185,129,0.22)',
          },
        ].map((card) => (
          <div
            key={card.label}
            className="relative overflow-hidden rounded-2xl bg-white/95 p-5 shadow-[0_16px_35px_rgba(15,23,42,0.08)] transition hover:-translate-y-1 hover:shadow-[0_22px_48px_rgba(71,105,173,0.16)] dark:bg-white/10"
          >
            <div
              className="absolute inset-x-3 top-3 h-[5px] rounded-full"
              style={{ background: `linear-gradient(120deg, ${card.glow}, rgba(111,126,252,0.18))` }}
            />
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">
              {card.label}
            </p>
            <p className={`mt-3 text-3xl font-semibold ${card.tone} dark:text-white`}>{card.value}</p>
          </div>
        ))}
      </div>

      <div className="card-strong rounded-3xl p-6 backdrop-blur-xl">
        <header className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">最近の投稿ログ</h3>
          <span className="text-xs text-slate-500 dark:text-slate-300">最新10件</span>
        </header>
        <div className="space-y-3 text-xs text-slate-600 dark:text-slate-200">
          {recentLogs.length === 0 ? (
            <p className="rounded-2xl bg-white/80 p-4 text-center text-slate-400 shadow-inner dark:bg-white/10">
              投稿ログはまだありません。
            </p>
          ) : (
            recentLogs.map((log) => {
              const tone = statusColor[log.status] ?? 'text-slate-600 bg-slate-100';
              return (
                <div
                  key={`${log.jobId}-${log.postedAt ?? 'na'}`}
                  className="grid gap-4 rounded-2xl bg-white/95 p-4 shadow-[0_12px_25px_rgba(15,23,42,0.08)] transition hover:-translate-y-[2px] hover:shadow-[0_16px_32px_rgba(52,86,155,0.14)] dark:bg-white/10 md:grid-cols-[1.2fr,1fr,1fr]"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-white">Plan {log.planId}</p>
                    <p className="mt-1 text-slate-400">Job {log.jobId}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 font-semibold ${tone}`}>
                      {log.status}
                    </span>
                    {log.postedThreadId ? (
                      <span className="text-slate-400 dark:text-slate-300">Thread ID: {log.postedThreadId}</span>
                    ) : null}
                    {log.errorMessage ? (
                      <span className="text-rose-500 dark:text-rose-300">{log.errorMessage}</span>
                    ) : null}
                  </div>
                  <div className="text-slate-400 dark:text-slate-300">
                    {log.postedAt ? new Date(log.postedAt).toLocaleString() : '—'}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
