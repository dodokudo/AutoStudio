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
  succeeded: 'text-emerald-300',
  failed: 'text-rose-300',
  processing: 'text-sky-300',
  pending: 'text-amber-300',
};

export function DashboardCards({ jobCounts, recentLogs }: DashboardCardsProps) {
  return (
    <section className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow">
          <p className="text-xs text-slate-400">Pending jobs</p>
          <p className="mt-2 text-2xl font-semibold text-white">{jobCounts.pending}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow">
          <p className="text-xs text-slate-400">Processing</p>
          <p className="mt-2 text-2xl font-semibold text-white">{jobCounts.processing}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow">
          <p className="text-xs text-slate-400">Failed</p>
          <p className="mt-2 text-2xl font-semibold text-rose-300">{jobCounts.failed}</p>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow">
          <p className="text-xs text-slate-400">Succeeded (Today)</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-300">{jobCounts.succeededToday}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">最近の投稿ログ</h3>
          <span className="text-xs text-slate-400">最新10件</span>
        </header>
        <div className="space-y-3 text-xs text-slate-300">
          {recentLogs.length === 0 ? (
            <p className="text-slate-400">投稿ログはまだありません。</p>
          ) : (
            recentLogs.map((log) => (
              <div
                key={`${log.jobId}-${log.postedAt ?? 'na'}`}
                className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3 md:grid-cols-[1.2fr,1fr,1fr]"
              >
                <div>
                  <p className="font-semibold text-slate-200">Plan {log.planId}</p>
                  <p className="mt-1 text-slate-400">Job {log.jobId}</p>
                </div>
                <div className="flex flex-col">
                  <span className={`${statusColor[log.status] ?? 'text-slate-300'} font-semibold`}>{log.status}</span>
                  {log.postedThreadId ? (
                    <span className="text-slate-400">Thread ID: {log.postedThreadId}</span>
                  ) : null}
                  {log.errorMessage ? (
                    <span className="text-rose-300">{log.errorMessage}</span>
                  ) : null}
                </div>
                <div className="text-slate-400">
                  {log.postedAt ? new Date(log.postedAt).toLocaleString() : '—'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
