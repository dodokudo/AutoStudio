import { Banner } from '@/components/ui/banner';
import { getHomeDashboardData } from '@/lib/home/dashboard';
import { HomeDashboardShell } from './_components/HomeDashboardShell';

export const dynamic = 'force-dynamic';

const RANGE_PRESETS = [
  { value: '7d', label: '7日間', days: 7 },
  { value: '30d', label: '30日間', days: 30 },
  { value: '90d', label: '90日間', days: 90 },
] as const;

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Record<string, string | string[]>;
}) {
  const rangeParam = typeof searchParams?.range === 'string' ? searchParams.range : undefined;
  const selectedRangeOption = RANGE_PRESETS.find((option) => option.value === rangeParam) ?? RANGE_PRESETS[0];

  try {
    const data = await getHomeDashboardData({ rangeDays: selectedRangeOption.days, rangeValue: selectedRangeOption.value });

    return (
      <div className="section-stack">
        <HomeDashboardShell
          data={data}
          rangeOptions={RANGE_PRESETS.map(({ value, label }) => ({ value, label }))}
          selectedRange={selectedRangeOption.value}
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
