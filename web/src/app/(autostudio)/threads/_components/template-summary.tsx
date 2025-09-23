interface TemplateSummaryItem {
  templateId: string;
  version: number;
  status: string;
  impressionAvg72h?: number;
  likeAvg72h?: number;
  structureNotes?: string;
}

interface TemplateSummaryProps {
  items: TemplateSummaryItem[];
}

export function TemplateSummary({ items }: TemplateSummaryProps) {
  if (!items.length) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-white">テンプレ評価</h2>
        <p className="mt-1 text-xs text-slate-400">投稿後72時間の平均インプレッション / いいねで算出</p>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {items.slice(0, 6).map((item) => (
          <article key={item.templateId} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <header className="flex items-center justify-between text-sm text-white">
              <span className="font-medium">{item.templateId}</span>
              <span className="text-xs text-slate-400">v{item.version}</span>
            </header>
            <dl className="mt-3 flex justify-between text-xs text-slate-300">
              <div>
                <dt>平均インプレッション</dt>
                <dd className="text-emerald-400 text-sm font-semibold">
                  {item.impressionAvg72h ? Math.round(item.impressionAvg72h).toLocaleString() : '—'}
                </dd>
              </div>
              <div className="text-right">
                <dt>平均いいね</dt>
                <dd className="text-sky-400 text-sm font-semibold">
                  {item.likeAvg72h ? Math.round(item.likeAvg72h).toLocaleString() : '—'}
                </dd>
              </div>
            </dl>
            {item.structureNotes ? (
              <p className="mt-3 text-xs text-slate-400">{item.structureNotes}</p>
            ) : null}
            <p className="mt-3 text-xs text-slate-500">状態: {item.status}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
