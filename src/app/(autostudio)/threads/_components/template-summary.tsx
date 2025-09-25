interface TemplateSummaryItem {
  templateId: string;
  version: number;
  status: string;
  impressionAvg72h?: number;
  likeAvg72h?: number;
  structureNotes?: string;
}

interface TemplateSummaryProps {
  items?: TemplateSummaryItem[];
}

const statusColor: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  draft: 'bg-slate-200 text-slate-700',
  archived: 'bg-slate-300 text-slate-600',
  needs_review: 'bg-amber-100 text-amber-700',
};

export function TemplateSummary({ items }: TemplateSummaryProps) {
  if (!items || !items.length) {
    return null;
  }

  return (
    <section className="card-strong rounded-3xl p-6 backdrop-blur-xl">
      <header className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">テンプレート評価</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">投稿後72時間の平均インプレッション / いいねで算出</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.slice(0, 6).map((item) => (
          <article
            key={item.templateId}
            className="relative overflow-hidden rounded-2xl bg-white/95 p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)] transition-all hover:-translate-y-1 hover:shadow-[0_24px_48px_rgba(56,102,179,0.14)] dark:bg-white/10"
          >
            <div
              className="absolute inset-x-4 top-3 h-[5px] rounded-full"
              style={{
                background:
                  'linear-gradient(120deg, rgba(79,140,255,0.35), rgba(111,126,252,0.35), rgba(16,185,129,0.25))',
              }}
            />
            <header className="mt-5 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-900 dark:text-white">{item.templateId}</span>
              <span className="text-xs font-semibold text-slate-400">v{item.version}</span>
            </header>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-xs text-slate-500 dark:text-slate-300">
              <div>
                <dt className="uppercase tracking-wide">平均インプレッション</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900 dark:text-emerald-200">
                  {item.impressionAvg72h ? Math.round(item.impressionAvg72h).toLocaleString() : '—'}
                </dd>
              </div>
              <div className="text-right">
                <dt className="uppercase tracking-wide">平均いいね</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900 dark:text-sky-200">
                  {item.likeAvg72h ? Math.round(item.likeAvg72h).toLocaleString() : '—'}
                </dd>
              </div>
            </dl>
            {item.structureNotes ? (
              <p className="mt-4 text-xs leading-relaxed text-slate-500 dark:text-slate-300">{item.structureNotes}</p>
            ) : null}
            <span
              className={`mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${
                statusColor[item.status] ?? 'bg-slate-100 text-slate-600'
              }`}
            >
              状態: {item.status}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}
