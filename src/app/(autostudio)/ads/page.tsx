import { AdsDashboardShell } from './_components/AdsDashboardShell';
import { UNIFIED_RANGE_OPTIONS, resolveDateRange, isUnifiedRangePreset, type UnifiedRangePreset } from '@/lib/dateRangePresets';
import { getAdsDashboardData } from '@/lib/ads/bigquery';

export const dynamic = 'force-dynamic';

export default async function AdsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const resolvedSearchParams = await searchParams;
  const rangeParam = typeof resolvedSearchParams?.range === 'string' ? resolvedSearchParams.range : undefined;
  const selectedRange: UnifiedRangePreset = isUnifiedRangePreset(rangeParam) ? rangeParam : 'all';

  const range = resolveDateRange(selectedRange);
  const period = {
    start: range.start.toISOString().slice(0, 10),
    end: range.end.toISOString().slice(0, 10),
  };
  const data = await getAdsDashboardData(period.start, period.end);

  return (
    <div className="section-stack">
      <AdsDashboardShell rangeOptions={UNIFIED_RANGE_OPTIONS} selectedRange={selectedRange} period={period} data={data} />
    </div>
  );
}
