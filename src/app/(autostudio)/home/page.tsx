import { unstable_cache } from 'next/cache';
import { Banner } from '@/components/ui/banner';
import { getHomeDashboardData } from '@/lib/home/dashboard';
import { getKpiTarget } from '@/lib/home/kpi-targets';
import { HomeDashboardClient } from './_components/HomeDashboardClient';
import { resolveDateRange, isUnifiedRangePreset, formatDateInput } from '@/lib/dateRangePresets';

const getCachedHomeDashboardData = unstable_cache(
  async (startDateISO: string, endDateISO: string, rangeValue: string) => {
    return getHomeDashboardData({
      startDate: new Date(startDateISO),
      endDate: new Date(endDateISO),
      rangeValue,
    });
  },
  ['home-dashboard'],
  { revalidate: 300 }
);

const getCachedKpiTarget = unstable_cache(
  async (month: string) => {
    return getKpiTarget(month).catch(() => null);
  },
  ['kpi-target'],
  { revalidate: 1800 }
);

function getCurrentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const params = await searchParams;
  const rangeParam = typeof params?.range === 'string' ? params.range : undefined;
  const startParam = typeof params?.start === 'string' ? params.start : undefined;
  const endParam = typeof params?.end === 'string' ? params.end : undefined;

  const selectedValue = isUnifiedRangePreset(rangeParam) ? rangeParam : 'this-month';
  const resolvedRange = resolveDateRange(selectedValue, startParam, endParam, { includeToday: true });
  const rangeValueForUi = resolvedRange.preset;
  const customStart = rangeValueForUi === 'custom' ? formatDateInput(resolvedRange.start) : startParam;
  const customEnd = rangeValueForUi === 'custom' ? formatDateInput(resolvedRange.end) : endParam;

  const currentMonth = getCurrentMonth();

  try {
    // 並列でデータを取得
    const [dashboardData, kpiTarget] = await Promise.all([
      getCachedHomeDashboardData(
        resolvedRange.start.toISOString(),
        resolvedRange.end.toISOString(),
        resolvedRange.preset,
      ),
      getCachedKpiTarget(currentMonth),
    ]);

    return (
      <div className="section-stack">
        <HomeDashboardClient
          initialDashboardData={dashboardData}
          initialKpiTarget={kpiTarget}
          currentMonth={currentMonth}
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
          <p className="font-semibold">ホームダッシュボードの読み込みに失敗しました</p>
          <p className="mt-1 text-sm">{message}</p>
          <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">BigQuery や API 連携設定をご確認ください。</p>
        </Banner>
      </div>
    );
  }
}
