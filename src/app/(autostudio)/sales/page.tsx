import { getSalesSummary } from '@/lib/univapay/client';
import { Banner } from '@/components/ui/banner';
import { SalesDashboardClient } from './_components/SalesDashboardClient';
import { SalesRangeSelector } from './_components/SalesRangeSelector';
import { UNIFIED_RANGE_OPTIONS, resolveDateRange, isUnifiedRangePreset, formatDateInput, type UnifiedRangePreset } from '@/lib/dateRangePresets';
import { getChargeCategories, getManualSales } from '@/lib/sales/categories';
import { getAllGroups } from '@/lib/sales/groups';
import { getLstepAnalytics } from '@/lib/lstep/analytics';
import { resolveProjectId } from '@/lib/bigquery';

export const dynamic = 'force-dynamic';

const RANGE_SELECT_OPTIONS = UNIFIED_RANGE_OPTIONS;
const LSTEP_PROJECT_ID = (() => {
  const preferred = process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID;
  return preferred ? resolveProjectId(preferred) : undefined;
})();

export default async function SalesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const hasConfig = !!(
    process.env.UNIVAPAY_JWT &&
    process.env.UNIVAPAY_SECRET &&
    process.env.UNIVAPAY_STORE_ID
  );

  if (!hasConfig) {
    return (
      <div className="section-stack">
        <Banner variant="warning">
          <p className="font-semibold">UnivaPay API が未設定です</p>
          <p className="mt-2">
            `UNIVAPAY_JWT`, `UNIVAPAY_SECRET`, `UNIVAPAY_STORE_ID` を環境変数に設定してください。
          </p>
        </Banner>
      </div>
    );
  }

  // 日付範囲パラメータを処理
  const resolvedSearchParams = await searchParams;
  const rangeParam = typeof resolvedSearchParams?.range === 'string' ? resolvedSearchParams.range : undefined;
  const startParam = typeof resolvedSearchParams?.start === 'string' ? resolvedSearchParams.start : undefined;
  const endParam = typeof resolvedSearchParams?.end === 'string' ? resolvedSearchParams.end : undefined;

  const selectedRangeValue: UnifiedRangePreset = isUnifiedRangePreset(rangeParam) ? rangeParam : '30d';
  const resolvedRange = resolveDateRange(selectedRangeValue, startParam, endParam, { includeToday: true });
  const rangeValueForUi = resolvedRange.preset;
  const customStart = rangeValueForUi === 'custom' ? formatDateInput(resolvedRange.start) : startParam;
  const customEnd = rangeValueForUi === 'custom' ? formatDateInput(resolvedRange.end) : endParam;

  try {
    const startDate = resolvedRange.start.toISOString();
    const endDate = resolvedRange.end.toISOString();
    const startDateStr = formatDateInput(resolvedRange.start);
    const endDateStr = formatDateInput(resolvedRange.end);
    const cashflowStart = new Date(resolvedRange.start);
    cashflowStart.setDate(cashflowStart.getDate() - 31);
    const cashflowStartDate = cashflowStart.toISOString();
    const monthlyStart = new Date();
    monthlyStart.setHours(0, 0, 0, 0);
    monthlyStart.setMonth(monthlyStart.getMonth() - 11);
    monthlyStart.setDate(1);
    const monthlyEnd = new Date();
    monthlyEnd.setHours(0, 0, 0, 0);
    const monthlyStartDate = monthlyStart.toISOString();
    const monthlyEndDate = monthlyEnd.toISOString();
    const monthlyStartDateStr = formatDateInput(monthlyStart);
    const monthlyEndDateStr = formatDateInput(monthlyEnd);

    const [summary, cashflowSummary, monthlySummary, manualSales, monthlyManualSales, groupsMap, lstepAnalytics] = await Promise.all([
      getSalesSummary(startDate, endDate),
      getSalesSummary(cashflowStartDate, endDate),
      getSalesSummary(monthlyStartDate, monthlyEndDate),
      getManualSales(startDateStr, endDateStr),
      getManualSales(monthlyStartDateStr, monthlyEndDateStr),
      getAllGroups().catch(() => new Map()),
      LSTEP_PROJECT_ID ? getLstepAnalytics(LSTEP_PROJECT_ID).catch(() => null) : Promise.resolve(null),
    ]);

    // カテゴリデータを取得
    const chargeIds = summary.charges.map(c => c.id);
    const categoriesMap = await getChargeCategories(chargeIds);
    const categories: Record<string, string> = {};
    for (const [id, cat] of categoriesMap) {
      categories[id] = cat;
    }

    const monthlyChargeIds = monthlySummary.charges.map(c => c.id);
    const monthlyCategoriesMap = await getChargeCategories(monthlyChargeIds);
    const monthlyCategories: Record<string, string> = {};
    for (const [id, cat] of monthlyCategoriesMap) {
      monthlyCategories[id] = cat;
    }

    // グループデータを変換
    const groups = Array.from(groupsMap.values()).map(({ group, items }) => ({
      id: group.id,
      name: group.name,
      items: items.map((i: { itemType: 'charge' | 'manual'; itemId: string }) => ({
        itemType: i.itemType,
        itemId: i.itemId,
      })),
    }));

    return (
      <div className="section-stack">
        {/* ヘッダー */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-bold text-[color:var(--color-text-primary)]">Sales</h1>
          <SalesRangeSelector
            options={RANGE_SELECT_OPTIONS}
            value={rangeValueForUi}
            customStart={customStart}
            customEnd={customEnd}
          />
        </div>

        <SalesDashboardClient
          initialData={{
            summary: {
              totalAmount: summary.totalAmount,
              successfulCount: summary.successfulCount,
              failedCount: summary.failedCount,
              pendingCount: summary.pendingCount,
            },
            charges: summary.charges,
            cashflowCharges: cashflowSummary.charges,
            dateRange: {
              from: startDateStr,
              to: endDateStr,
            },
            categories,
            manualSales,
            groups,
            lineDailyRegistrations: lstepAnalytics?.dailyRegistrations ?? [],
            monthlyData: {
              charges: monthlySummary.charges,
              categories: monthlyCategories,
              manualSales: monthlyManualSales,
              groups,
              rangeStart: monthlyStartDateStr,
              rangeEnd: monthlyEndDateStr,
            },
          }}
        />
      </div>
    );
  } catch (error) {
    console.error('[sales/page] Error:', error);
    return (
      <div className="section-stack">
        {/* ヘッダー */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <h1 className="text-2xl font-bold text-[color:var(--color-text-primary)]">Sales</h1>
          <SalesRangeSelector
            options={RANGE_SELECT_OPTIONS}
            value={rangeValueForUi}
            customStart={customStart}
            customEnd={customEnd}
          />
        </div>

        <Banner variant="error">
          <p className="font-semibold">エラーが発生しました</p>
          <p className="mt-2">売上データの取得中にエラーが発生しました。</p>
          <details className="mt-2">
            <summary className="text-xs cursor-pointer">詳細情報</summary>
            <pre className="mt-2 text-xs overflow-auto whitespace-pre-wrap">
              {error instanceof Error ? error.message : String(error)}
            </pre>
          </details>
        </Banner>
      </div>
    );
  }
}
