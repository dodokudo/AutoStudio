import { Banner } from '@/components/ui/banner';
import { SalesDashboardClient } from './_components/SalesDashboardClient';
import { SalesRangeSelector } from './_components/SalesRangeSelector';
import { UNIFIED_RANGE_OPTIONS, resolveDateRange, isUnifiedRangePreset, formatDateInput, type UnifiedRangePreset } from '@/lib/dateRangePresets';

export const dynamic = 'force-dynamic';

const RANGE_SELECT_OPTIONS = UNIFIED_RANGE_OPTIONS;
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

  const selectedRangeValue: UnifiedRangePreset = isUnifiedRangePreset(rangeParam) ? rangeParam : 'this-month';
  const resolvedRange = resolveDateRange(selectedRangeValue, startParam, endParam, { includeToday: true });
  const rangeValueForUi = resolvedRange.preset;
  const customStart = rangeValueForUi === 'custom' ? formatDateInput(resolvedRange.start) : startParam;
  const customEnd = rangeValueForUi === 'custom' ? formatDateInput(resolvedRange.end) : endParam;

  try {
    const startDateStr = formatDateInput(resolvedRange.start);
    const endDateStr = formatDateInput(resolvedRange.end);
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
              totalAmount: 0,
              successfulCount: 0,
              failedCount: 0,
              pendingCount: 0,
            },
            charges: [],
            dateRange: {
              from: startDateStr,
              to: endDateStr,
            },
            categories: {},
            manualSales: [],
            groups: [],
            lineDailyRegistrations: [],
            deferred: true,
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
