import { Banner } from '@/components/ui/banner';
import { getHomeDashboardData } from '@/lib/home/dashboard';
import { HomeDashboardShell } from './_components/HomeDashboardShell';
import { UNIFIED_RANGE_OPTIONS, resolveDateRange, isUnifiedRangePreset } from '@/lib/dateRangePresets';

export const dynamic = 'force-dynamic';

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const params = await searchParams;
  const rangeParam = typeof params?.range === 'string' ? params.range : undefined;
  const startParam = typeof params?.start === 'string' ? params.start : undefined;
  const endParam = typeof params?.end === 'string' ? params.end : undefined;

  const selectedValue = isUnifiedRangePreset(rangeParam) ? rangeParam : '7d';
  const resolvedRange = resolveDateRange(selectedValue, startParam, endParam);

  try {
    const data = await getHomeDashboardData({
      startDate: resolvedRange.start,
      endDate: resolvedRange.end,
      rangeValue: resolvedRange.preset,
    });

    return (
      <div className="section-stack">
        <HomeDashboardShell
          data={data}
          rangeOptions={UNIFIED_RANGE_OPTIONS}
          selectedRange={resolvedRange.preset}
          customStart={startParam}
          customEnd={endParam}
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
