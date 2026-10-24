import { followConversionRate, SUPPLEMENTAL_METRICS, type MetricName, type SupplementalPostInsights } from '@/lib/threadsSupplementalMetrics';

const labels: Record<MetricName, string> = {
  views: '閲覧数', reach: 'リーチ', likes: 'いいね', replies: '返信', reposts: '再投稿', quotes: '引用', shares: 'シェア',
  profile_visits: 'プロフィール訪問', follows: 'フォロー獲得',
  views_from_followers: 'フォロワーからの閲覧', views_from_non_followers: '非フォロワーからの閲覧',
};

export function SupplementalMetrics({ insights, missingLabel, expanded = false }: {
  insights?: SupplementalPostInsights | null;
  missingLabel: string;
  expanded?: boolean;
}) {
  const conversion = followConversionRate(insights);
  return (
    <div className="mt-2 rounded-md bg-[color:var(--color-surface-muted)] px-3 py-2 text-xs">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>フォロー獲得 <strong>{insights?.follows == null ? missingLabel : insights.follows.toLocaleString()}</strong></span>
        <span>プロフィール訪問 <strong>{insights?.profileVisits == null ? missingLabel : insights.profileVisits.toLocaleString()}</strong></span>
        <span title="フォロー獲得数 ÷ プロフィール訪問数 × 100">フォロー転換率 <strong>{conversion === null ? '—' : `${conversion.toFixed(2)}%`}</strong></span>
        {insights && <span className="w-full text-[10px] text-[color:var(--color-text-muted)]">
          {new Date(insights.snapshotAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} JST取得時点の累計（Meta AI連携）
        </span>}
      </div>
      {expanded && insights?.metrics && (
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-[color:var(--color-border)] pt-2 sm:grid-cols-3">
          {SUPPLEMENTAL_METRICS.filter((name) => name !== 'follows' && name !== 'profile_visits').map((name) => (
            <div key={name} className="flex flex-wrap justify-between gap-x-2">
              <dt className="text-[color:var(--color-text-muted)]">{labels[name]}</dt>
              <dd>{insights.metrics![name] == null ? '未取得' : insights.metrics![name]!.toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
