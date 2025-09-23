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
    <li key={item.themeTag} className="space-y-1 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center justify-between text-sm text-white">
        <span className="font-medium">{item.themeTag}</span>
        <span className={item.avgFollowersDelta >= 0 ? 'text-emerald-400 text-xs' : 'text-rose-400 text-xs'}>
          Δフォロワー {Math.round(item.avgFollowersDelta)}
        </span>
      </div>
      <p className="text-xs text-slate-300">平均閲覧 {Math.round(item.avgViews).toLocaleString()}</p>
      {item.sampleAccounts.length ? (
        <p className="text-xs text-slate-400">例: {item.sampleAccounts.join(', ')}</p>
      ) : null}
    </li>
  );

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
      <header className="mb-4">
        <h2 className="text-lg font-semibold text-white">トレンドテーマ</h2>
        <p className="mt-1 text-xs text-slate-400">直近7日でのフォロワー増減を基準にテーマを抽出</p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-emerald-400">伸びているテーマ</h3>
          <ul className="mt-2 space-y-2 text-sm text-slate-200">
            {positives.length ? positives.slice(0, 3).map(renderItem) : <li className="text-xs text-slate-400">データ不足</li>}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-rose-400">落ちているテーマ</h3>
          <ul className="mt-2 space-y-2 text-sm text-slate-200">
            {negatives.length ? negatives.slice(0, 3).map(renderItem) : <li className="text-xs text-slate-400">データ不足</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}
