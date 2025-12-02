import { AdsDashboardShell } from './_components/AdsDashboardShell';
import { UNIFIED_RANGE_OPTIONS, resolveDateRange, isUnifiedRangePreset, type UnifiedRangePreset } from '@/lib/dateRangePresets';

export const dynamic = 'force-dynamic';

export default async function AdsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const resolvedSearchParams = await searchParams;
  const rangeParam = typeof resolvedSearchParams?.range === 'string' ? resolvedSearchParams.range : undefined;
  const selectedRange: UnifiedRangePreset = isUnifiedRangePreset(rangeParam) ? rangeParam : '7d';

  const range = resolveDateRange(selectedRange);
  const period = {
    start: range.start.toISOString().slice(0, 10),
    end: range.end.toISOString().slice(0, 10),
  };

  return (
    <div className="section-stack">
      <AdsDashboardShell rangeOptions={UNIFIED_RANGE_OPTIONS} selectedRange={selectedRange} period={period} />
    </div>
  );
}
