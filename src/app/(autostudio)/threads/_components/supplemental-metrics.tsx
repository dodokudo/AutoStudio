import { followConversionRate, type SupplementalPostInsights } from '@/lib/threadsSupplementalMetrics';

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
    { label: 'プロフィール訪問', value: count(insights?.profileVisits, tree?.profileVisitsComplete) },
    { label: 'フォロー転換率', value: conversion === null ? '—' : `${conversion.toFixed(2)}%` },
    { label: 'フォロー獲得', value: count(insights?.follows, tree?.followsComplete) },
  ];
  const metrics = [
    ...(expanded ? [
      { label: '閲覧数', value: count(insights?.metrics?.views) },
      { label: 'リーチ', value: count(insights?.metrics?.reach) },
    ] : []),
    ...primary,
  ];
  return (
    <div className={embedded
      ? 'mt-2 border-t border-purple-200 pt-2 text-xs'
      : 'mt-2 rounded-md bg-[color:var(--color-surface-muted)] px-3 py-2 text-xs'}>
      <dl className={expanded ? 'grid grid-cols-2 gap-3 sm:grid-cols-5' : 'flex flex-wrap gap-x-4 gap-y-1'}>
        {metrics.map(({ label, value }) => (
          <div key={label} className={expanded ? 'flex flex-col gap-1' : 'flex flex-wrap gap-x-2'}>
            <dt className="text-[color:var(--color-text-muted)]">{label}</dt>
            <dd className={expanded ? 'text-sm font-semibold' : 'font-semibold'}>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
