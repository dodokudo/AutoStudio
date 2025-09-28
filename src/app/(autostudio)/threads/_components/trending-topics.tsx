import { Card } from '@/components/ui/card';

interface TrendingTopicItem {
  themeTag: string;
  avgFollowersDelta: number;
  avgViews: number;
  sampleAccounts: string[];
}

interface TrendingTopicsProps {
  items: TrendingTopicItem[];
}

function formatDelta(value: number) {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}`;
}

export function TrendingTopics({ items }: TrendingTopicsProps) {
  const positives = items.filter((item) => item.avgFollowersDelta >= 0);
  const negatives = items.filter((item) => item.avgFollowersDelta < 0);

  const renderItem = (item: TrendingTopicItem) => (
    <li key={item.themeTag} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4 shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between text-sm text-[color:var(--color-text-primary)]">
        <span className="font-medium">{item.themeTag}</span>
        <span className={item.avgFollowersDelta >= 0 ? 'text-[#096c3e]' : 'text-[#a61b1b]'}>
          Δフォロワー {formatDelta(item.avgFollowersDelta)}
        </span>
      </div>
      <p className="mt-2 text-xs text-[color:var(--color-text-secondary)]">
        平均閲覧 {Math.round(item.avgViews).toLocaleString()}
      </p>
      {item.sampleAccounts.length ? (
        <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">例: {item.sampleAccounts.join(', ')}</p>
      ) : null}
    </li>
  );

  return (
    <Card>
      <header>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">トレンドテーマ</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">直近のフォロワー増減から注目テーマを抽出しています。</p>
      </header>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#096c3e]">伸びているテーマ</h3>
          <ul className="mt-3 space-y-3 text-sm text-[color:var(--color-text-secondary)]">
            {positives.length ? positives.slice(0, 3).map(renderItem) : (
              <li className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4 text-xs text-[color:var(--color-text-muted)]">
                データが不足しています。
              </li>
            )}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[#a61b1b]">停滞しているテーマ</h3>
          <ul className="mt-3 space-y-3 text-sm text-[color:var(--color-text-secondary)]">
            {negatives.length ? negatives.slice(0, 3).map(renderItem) : (
              <li className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4 text-xs text-[color:var(--color-text-muted)]">
                データが不足しています。
              </li>
            )}
          </ul>
        </div>
      </div>
    </Card>
  );
}
