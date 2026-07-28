import Link from 'next/link';
import { Banner } from '@/components/ui/banner';
import { SalesDashboardClient } from './_components/SalesDashboardClient';
import { SalesRangeSelector } from './_components/SalesRangeSelector';
import { UNIFIED_RANGE_OPTIONS, resolveDateRange, isUnifiedRangePreset, formatDateInput, type UnifiedRangePreset } from '@/lib/dateRangePresets';

const RANGE_SELECT_OPTIONS = UNIFIED_RANGE_OPTIONS;

const SALES_TABS = [
  { id: 'main', label: 'メイン' },
  { id: 'courses', label: '講座管理' },
  { id: 'frontend', label: 'フロントエンド' },
  { id: 'backend', label: 'バックエンド' },
] as const;

type SalesTabKey = (typeof SALES_TABS)[number]['id'];

export default async function SalesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const resolvedSearchParams = await searchParams;
  const tabParam = typeof resolvedSearchParams?.tab === 'string' ? resolvedSearchParams.tab : undefined;
  const activeTab: SalesTabKey = SALES_TABS.some((tab) => tab.id === tabParam)
    ? (tabParam as SalesTabKey)
    : 'main';

  const tabNav = (
      <nav aria-label="セールスタブ" className="flex min-w-0 items-end gap-1 overflow-x-auto scrollbar-hide">
        {SALES_TABS.map((tab) => {
          const params = new URLSearchParams();
          for (const [key, value] of Object.entries(resolvedSearchParams ?? {})) {
            if (typeof value === 'string') {
              params.set(key, value);
            }
          }
          if (tab.id === 'main') {
            params.delete('tab');
          } else {
            params.set('tab', tab.id);
          }
          const query = params.toString();
          const isActive = tab.id === activeTab;

          return (
            <Link
              key={tab.id}
              href={query ? `/sales?${query}` : '/sales'}
              scroll={false}
              aria-current={isActive ? 'page' : undefined}
              className={`relative whitespace-nowrap px-3 py-2 text-xs font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)] md:px-4 md:py-3 md:text-sm ${
                isActive
                  ? 'text-[color:var(--color-accent)]'
                  : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
              }`}
            >
              {tab.label}
              {isActive ? (
                <span className="pointer-events-none absolute inset-x-4 bottom-0 h-[2px] rounded-full bg-[color:var(--color-accent)]" />
              ) : null}
            </Link>
          );
        })}
      </nav>
  );

  const hasConfig = !!(
    process.env.UNIVAPAY_JWT &&
    process.env.UNIVAPAY_SECRET &&
    process.env.UNIVAPAY_STORE_ID
  );

  if (!hasConfig) {
    return (
      <div className="section-stack">
        <div className="border-b border-[color:var(--color-border)]">{tabNav}</div>
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
  const rangeParam = typeof resolvedSearchParams?.range === 'string' ? resolvedSearchParams.range : undefined;
  const startParam = typeof resolvedSearchParams?.start === 'string' ? resolvedSearchParams.start : undefined;
  const endParam = typeof resolvedSearchParams?.end === 'string' ? resolvedSearchParams.end : undefined;

  const selectedRangeValue: UnifiedRangePreset = isUnifiedRangePreset(rangeParam) ? rangeParam : 'this-month';
  const resolvedRange = resolveDateRange(selectedRangeValue, startParam, endParam, { includeToday: true });
  const rangeValueForUi = resolvedRange.preset;
  const customStart = rangeValueForUi === 'custom' ? formatDateInput(resolvedRange.start) : startParam;
  const customEnd = rangeValueForUi === 'custom' ? formatDateInput(resolvedRange.end) : endParam;
  const salesToolbar = (
    <div className="flex w-full min-w-0 items-end justify-between gap-3 overflow-hidden border-b border-[color:var(--color-border)]">
      {tabNav}
      <div className="shrink-0 pb-2">
        <SalesRangeSelector
          options={RANGE_SELECT_OPTIONS}
          value={rangeValueForUi}
          customStart={customStart}
          customEnd={customEnd}
        />
      </div>
    </div>
  );

  try {
    const startDateStr = formatDateInput(resolvedRange.start);
    const endDateStr = formatDateInput(resolvedRange.end);
    return (
      <div className="section-stack">
        {salesToolbar}

        <SalesDashboardClient
          view={activeTab}
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
        {salesToolbar}

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
