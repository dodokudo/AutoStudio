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
    <section className="card-strong rounded-[32px] p-6 backdrop-blur-xl">
      <header className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">競合ハイライト</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">直近7日でバズった投稿の抜粋と要点のメモ</p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <article
            key={item.accountName}
            className="relative overflow-hidden rounded-3xl bg-white/92 p-5 shadow-[0_18px_40px_rgba(84,110,192,0.16)] transition hover:-translate-y-1 hover:shadow-[0_24px_48px_rgba(82,94,170,0.22)] dark:bg-white/10"
          >
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-sky-300 via-primary/60 to-emerald-200" />
            <header className="mt-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-600 dark:bg-white/10 dark:text-white">
                  {item.accountName.charAt(0).toUpperCase()}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{item.accountName}</p>
                  {item.username ? <p className="text-xs text-slate-500 dark:text-slate-300">@{item.username}</p> : null}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 text-xs font-semibold text-slate-500 dark:text-slate-300">
                {item.impressions ? (
                  <span className="rounded-full bg-emerald-100/70 px-2 py-0.5 text-emerald-600">Imp {item.impressions}</span>
                ) : null}
                {item.likes ? (
                  <span className="rounded-full bg-sky-100/70 px-2 py-0.5 text-sky-600">Like {item.likes}</span>
                ) : null}
              </div>
            </header>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-200">{item.summary}</p>
            {item.categories && item.categories.length ? (
              <ul className="mt-4 flex flex-wrap gap-2 text-xs">
                {item.categories.map((category, index) => (
                  <li key={`${category}-${index}`} className="rounded-full bg-primary/10 px-3 py-1 text-primary">
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
