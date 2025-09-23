interface Highlight {
  accountName: string;
  username?: string | null;
  impressions?: string;
  likes?: string;
  summary: string;
  categories?: string[];
}

interface CompetitorHighlightProps {
  items: Highlight[];
}

export function CompetitorHighlights({ items }: CompetitorHighlightProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-white">競合ハイライト</h2>
        <p className="mt-1 text-xs text-slate-400">直近7日で伸びた投稿から抽出したメモ</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <article key={item.accountName} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <header className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-white">{item.accountName}</p>
                {item.username ? <p className="text-xs text-slate-400">@{item.username}</p> : null}
              </div>
              <div className="flex flex-col gap-1 text-right">
                {item.impressions ? (
                  <span className="text-xs text-emerald-400">Imp {item.impressions}</span>
                ) : null}
                {item.likes ? <span className="text-xs text-slate-300">Like {item.likes}</span> : null}
              </div>
            </header>
            <p className="mt-3 text-sm leading-relaxed text-slate-200">{item.summary}</p>
            {item.categories && item.categories.length ? (
              <ul className="mt-3 flex flex-wrap gap-2 text-xs">
                {item.categories.map((category) => (
                  <li key={category} className="rounded-full bg-slate-800 px-3 py-1 text-slate-300">
                    {category}
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
