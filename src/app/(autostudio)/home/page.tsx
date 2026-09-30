import { unstable_cache } from 'next/cache';
import { Banner } from '@/components/ui/banner';
import { getHomeDashboardData } from '@/lib/home/dashboard';
import { getKpiTarget } from '@/lib/home/kpi-targets';
import { HomeDashboardClient } from './_components/HomeDashboardClient';
import { isMonth, monthDates } from '@/lib/home/monthly-plan-types';

const getCachedHomeDashboardData = unstable_cache(
  async (startDateISO: string, endDateISO: string, rangeValue: string) => {
    return getHomeDashboardData({
      startDate: new Date(startDateISO),
      endDate: new Date(endDateISO),
      rangeValue,
    });
  },
  ['home-dashboard-v2'],
  { revalidate: 1800 }
);

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const params = await searchParams;
  const monthParam = params?.month;
  const currentMonth = isMonth(monthParam) ? monthParam : new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' }).format(new Date());
  const { start, end } = monthDates(currentMonth);

  try {
    // 並列でデータを取得
    const [dashboardData, kpiTarget] = await Promise.all([
      getCachedHomeDashboardData(
        `${start}T00:00:00`,
        `${end}T23:59:59`,
        'custom',
      ),
      getKpiTarget(currentMonth),
    ]);

    return (
      <div className="section-stack">
        <HomeDashboardClient
          key={currentMonth}
          initialDashboardData={dashboardData}
          initialKpiTarget={kpiTarget}
          currentMonth={currentMonth}
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
