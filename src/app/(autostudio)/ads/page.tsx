import { AdsDashboardShell } from './_components/AdsDashboardShell';
import { UNIFIED_RANGE_OPTIONS, resolveDateRange, isUnifiedRangePreset, type UnifiedRangePreset } from '@/lib/dateRangePresets';
import { getAdsDashboardData } from '@/lib/ads/bigquery';
import { getReelAdInsights } from '@/lib/ads/reelInsights';
import { unstable_cache } from 'next/cache';

export const dynamic = 'force-dynamic';

const getCachedAdsDashboardData = unstable_cache(
  async (startDate: string, endDate: string) => getAdsDashboardData(startDate, endDate),
  ['ads-dashboard-data'],
  { revalidate: 60 },
);

const getCachedReelAdInsights = unstable_cache(
  async (startDate: string, endDate: string) => getReelAdInsights(startDate, endDate),
  ['ads-reel-insights'],
  { revalidate: 60 },
);

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
  const [data, reelAdRows] = await Promise.all([
    getCachedAdsDashboardData(period.start, period.end),
    getCachedReelAdInsights(period.start, period.end).catch((err) => {
      console.warn('[ads] reel insights load failed', err);
      return [];
    }),
  ]);

  return (
    <div className="section-stack">
      <AdsDashboardShell rangeOptions={UNIFIED_RANGE_OPTIONS} selectedRange={selectedRange} period={period} data={data} reelAdRows={reelAdRows} />
    </div>
  );
}
