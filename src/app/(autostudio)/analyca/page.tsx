import { unstable_cache } from 'next/cache';
import { Banner } from '@/components/ui/banner';
import { formatDateInput, isUnifiedRangePreset, resolveDateRange } from '@/lib/dateRangePresets';
import { getAnalycaDashboardData } from '@/lib/analyca/dashboard';
import { AnalycaDashboardClient } from './_components/AnalycaDashboardClient';

const getCachedAnalycaDashboardData = unstable_cache(
  async (startDateISO: string, endDateISO: string) => {
    return getAnalycaDashboardData({
      startDate: new Date(startDateISO),
      endDate: new Date(endDateISO),
    });
  },
  ['analyca-dashboard'],
  { revalidate: 600 },
);

export default async function AnalycaPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const params = await searchParams;
  const rangeParam = typeof params?.range === 'string' ? params.range : undefined;
  const startParam = typeof params?.start === 'string' ? params.start : undefined;
  const endParam = typeof params?.end === 'string' ? params.end : undefined;

  const selectedValue = isUnifiedRangePreset(rangeParam) ? rangeParam : '30d';
  const resolvedRange = resolveDateRange(selectedValue, startParam, endParam, { includeToday: true });
  const rangeValueForUi = resolvedRange.preset;
  const customStart = rangeValueForUi === 'custom' ? formatDateInput(resolvedRange.start) : startParam;
  const customEnd = rangeValueForUi === 'custom' ? formatDateInput(resolvedRange.end) : endParam;

  try {
    const dashboardData = await getCachedAnalycaDashboardData(
      resolvedRange.start.toISOString(),
      resolvedRange.end.toISOString(),
    );

    return (
      <div className="section-stack">
        <AnalycaDashboardClient
          initialData={dashboardData}
          selectedRange={rangeValueForUi}
          customStart={customStart}
          customEnd={customEnd}
        />
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <div className="section-stack">
        <Banner variant="error">
          <p className="font-semibold">ANALYCAダッシュボードの読み込みに失敗しました</p>
          <p className="mt-1 text-sm">{message}</p>
          <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">BigQuery と UnivaPay の同期状況をご確認ください。</p>
        </Banner>
      </div>
    );
  }
}
