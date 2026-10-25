import { followConversionRate, type SupplementalPostInsights } from '@/lib/threadsSupplementalMetrics';

export function SupplementalMetrics({ insights, missingLabel, expanded = false, embedded = false, tree }: {
  insights?: Pick<SupplementalPostInsights, 'follows' | 'profileVisits' | 'metrics'> | null;
  missingLabel: string;
  expanded?: boolean;
  embedded?: boolean;
  tree?: { followsComplete: boolean; profileVisitsComplete: boolean; conversionComparable: boolean; conversionRate: number | null };
}) {
  const conversion = tree ? tree.conversionRate : followConversionRate(insights);
  const count = (value: number | null | undefined) => value == null ? missingLabel : value.toLocaleString();
  const conversionLabel = conversion !== null ? `${conversion.toFixed(2)}%`
    : insights?.follows == null || insights?.profileVisits == null ? missingLabel
      : insights.profileVisits === 0 ? '訪問0件' : '算出不可';
  const conversionReason = conversion !== null ? 'フォロー獲得数 ÷ プロフィール訪問数 × 100'
    : insights?.follows == null || insights?.profileVisits == null ? 'フォロー数またはプロフィール訪問数が未取得です。'
      : insights.profileVisits === 0 ? 'プロフィール訪問が0件のため転換率を計算できません。'
        : 'フォロー数とプロフィール訪問数の取得対象が揃っていません。';
  const primary = [
    { label: 'プロフィール訪問', value: count(insights?.profileVisits) },
    { label: 'フォロー獲得', value: count(insights?.follows) },
    { label: 'フォロー転換率', value: conversionLabel },
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
      ? 'min-w-0 text-[10px]'
      : 'mt-2 rounded-md bg-[color:var(--color-surface-muted)] px-3 py-2 text-[10px]'}>
      <dl className={expanded ? 'grid grid-cols-[repeat(auto-fit,minmax(100px,1fr))] gap-3' : 'flex flex-wrap gap-x-4 gap-y-2'}>
        {metrics.map(({ label, value }) => (
          <div key={label} title={label === 'フォロー転換率' ? conversionReason : undefined} className={expanded ? 'flex min-w-0 flex-col gap-1' : 'flex items-baseline gap-x-2'}>
            <dt className="text-[color:var(--color-text-muted)] whitespace-nowrap">{label}</dt>
            <dd className={`whitespace-nowrap ${expanded ? 'text-xs font-semibold' : 'font-semibold'}`}>{value}</dd>
          </div>
        ))}
      </dl>
      {expanded && (
        <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2 border-t border-[color:var(--color-border)] pt-2">
          {[
            { label: 'フォロワーからの閲覧', value: insights?.metrics?.views_from_followers },
            { label: 'フォロワー外からの閲覧', value: insights?.metrics?.views_from_non_followers },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-baseline gap-x-2">
              <dt className="text-[color:var(--color-text-muted)] whitespace-nowrap">{label}</dt>
              <dd className="font-semibold whitespace-nowrap">{count(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
