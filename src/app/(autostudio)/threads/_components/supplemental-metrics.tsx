import { followConversionRate, SUPPLEMENTAL_METRICS, type MetricName, type SupplementalPostInsights } from '@/lib/threadsSupplementalMetrics';

const labels: Record<MetricName, string> = {
  views: '閲覧数', reach: 'リーチ', likes: 'いいね', replies: '返信', reposts: '再投稿', quotes: '引用', shares: 'シェア',
  profile_visits: 'プロフィール訪問', follows: 'フォロー獲得',
  views_from_followers: 'フォロワーからの閲覧', views_from_non_followers: '非フォロワーからの閲覧',
};

export function SupplementalMetrics({ insights, missingLabel, expanded = false, embedded = false, tree }: {
  insights?: Pick<SupplementalPostInsights, 'follows' | 'profileVisits' | 'metrics'> | null;
  missingLabel: string;
  expanded?: boolean;
  embedded?: boolean;
  tree?: { followsComplete: boolean; profileVisitsComplete: boolean };
}) {
  const conversion = tree && (!tree.followsComplete || !tree.profileVisitsComplete) ? null : followConversionRate(insights);
  const count = (value: number | null | undefined, complete = true) => value == null ? missingLabel
    : `${value.toLocaleString()}${complete ? '' : '（取得済み分）'}`;
  const primary = [
    { label: 'フォロー獲得', value: count(insights?.follows, tree?.followsComplete) },
    { label: 'プロフィール訪問', value: count(insights?.profileVisits, tree?.profileVisitsComplete) },
    { label: 'フォロー転換率', value: conversion === null ? '—' : `${conversion.toFixed(2)}%` },
  ];
  const metrics = [...primary, ...(expanded ? SUPPLEMENTAL_METRICS.filter((name) => name !== 'follows' && name !== 'profile_visits')
    .map((name) => ({ label: labels[name], value: count(insights?.metrics?.[name]) })) : [])];
  return (
    <div className={embedded
      ? 'mt-2 border-t border-purple-200 pt-2 text-xs'
      : 'mt-2 rounded-md bg-[color:var(--color-surface-muted)] px-3 py-2 text-xs'}>
      {tree && <p className="mb-1 text-[10px] text-[color:var(--color-text-muted)]" title="親投稿と本人返信の累計を合算。重複排除した人数ではありません。">ツリー全体（累計）</p>}
      <dl className={expanded ? 'grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3' : 'flex flex-wrap gap-x-4 gap-y-1'}>
        {metrics.map(({ label, value }) => (
          <div key={label} className={`flex flex-wrap gap-x-2 ${expanded ? 'justify-between' : ''}`}>
            <dt className="text-[color:var(--color-text-muted)]">{label}</dt>
            <dd className={expanded ? '' : 'font-semibold'}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
