interface TrendingTopicItem {
  themeTag: string;
  avgFollowersDelta: number;
  avgViews: number;
  sampleAccounts: string[];
}

interface TrendingTopicsProps {
  items: TrendingTopicItem[];
}

export function TrendingTopics({ items }: TrendingTopicsProps) {
  const positives = items.filter((item) => item.avgFollowersDelta >= 0);
  const negatives = items.filter((item) => item.avgFollowersDelta < 0);

  const renderItem = (item: TrendingTopicItem) => (
    <li
      key={item.themeTag}
      className="relative overflow-hidden rounded-2xl bg-white/90 p-4 shadow-[0_16px_35px_rgba(15,23,42,0.08)] transition-transform hover:-translate-y-1 hover:shadow-[0_20px_45px_rgba(58,106,179,0.16)] dark:bg-white/10"
    >
      <div
        className="absolute inset-x-4 top-3 h-[5px] rounded-full"
        style={{
          background:
            'linear-gradient(135deg, rgba(115,166,255,0.35), rgba(134,102,255,0.35), rgba(16,185,129,0.2))',
        }}
      />
      <div className="mt-4 flex items-center justify-between text-sm text-slate-800 dark:text-slate-100">
        <span className="font-semibold">{item.themeTag}</span>
        <span className={`${item.avgFollowersDelta >= 0 ? 'text-emerald-500' : 'text-rose-500'} text-xs font-medium`}>
          Δフォロワー {Math.round(item.avgFollowersDelta)}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-300">
        平均閲覧 {Math.round(item.avgViews).toLocaleString()}
      </p>
      {item.sampleAccounts.length ? (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-300">例: {item.sampleAccounts.join(', ')}</p>
      ) : null}
    </li>
  );

  return (
    <section className="card-strong rounded-3xl p-6 backdrop-blur-xl">
      <header className="mb-5">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">トレンドテーマ</h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">直近7日でのフォロワー増減を基準にテーマを抽出</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-500">伸びているテーマ</h3>
          <ul className="mt-3 space-y-3 text-sm text-slate-700 dark:text-slate-200">
            {positives.length ? positives.slice(0, 3).map(renderItem) : (
              <li className="rounded-xl bg-white/70 p-4 text-xs text-slate-400 shadow-sm dark:bg-white/5">
                データ不足
              </li>
            )}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-rose-500">落ちているテーマ</h3>
          <ul className="mt-3 space-y-3 text-sm text-slate-700 dark:text-slate-200">
            {negatives.length ? negatives.slice(0, 3).map(renderItem) : (
              <li className="rounded-xl bg-white/70 p-4 text-xs text-slate-400 shadow-sm dark:bg-white/5">
                データ不足
              </li>
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
