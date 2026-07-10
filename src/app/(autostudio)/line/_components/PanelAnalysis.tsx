'use client';

import useSWR from 'swr';

import { Card } from '@/components/ui/card';

interface PanelItem {
  label: string;
  count: number;
  rate: number;
  missing?: boolean;
}

interface PanelSection {
  title: string;
  items: PanelItem[];
}

interface SummaryStep {
  label: string;
  count: number;
  conversionRate: number | null;
  overallRate: number;
}

interface PanelAnalysisResponse {
  snapshotDate: string | null;
  base: number;
  summary: SummaryStep[];
  sections: PanelSection[];
  missingColumns: string[];
  error?: string;
}

const fetcher = async (input: RequestInfo) => {
  const res = await fetch(input.toString());
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'データの取得に失敗しました');
  return json as PanelAnalysisResponse;
};

const numberFormatter = new Intl.NumberFormat('ja-JP');
const percentFormatter = new Intl.NumberFormat('ja-JP', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}

function formatPercent(value: number): string {
  return `${percentFormatter.format(value)}%`;
}

export function PanelAnalysis() {
  const { data, error, isLoading } = useSWR<PanelAnalysisResponse>('/api/line/panel-analysis', fetcher, {
    revalidateOnFocus: false,
  });

  if (isLoading) {
    return (
      <Card className="p-6">
        <p className="text-sm text-[color:var(--color-text-secondary)]">パネル分析データを読み込み中...</p>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-6">
        <p className="text-sm font-semibold text-red-600">パネル分析データの取得に失敗しました</p>
        <p className="mt-2 text-xs text-[color:var(--color-text-secondary)]">
          {error instanceof Error ? error.message : '不明なエラー'}
        </p>
      </Card>
    );
  }

  const maxSummaryCount = Math.max(...data.summary.map((s) => s.count), 1);

  return (
    <div className="section-stack space-y-4">
      {/* サマリーファネル */}
      <Card className="p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
            【2026.7】セミナーファネル サマリー
          </h2>
          {data.snapshotDate ? (
            <span className="text-xs text-[color:var(--color-text-muted)]">
              スナップショット: {data.snapshotDate}
            </span>
          ) : null}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--color-border)]">
                <th className="px-4 py-2 text-left text-sm font-medium text-[color:var(--color-text-secondary)]">フェーズ</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-[color:var(--color-text-secondary)]">人数</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-[color:var(--color-text-secondary)]">移行率</th>
                <th className="px-4 py-2 text-right text-sm font-medium text-[color:var(--color-text-secondary)]">全体比</th>
                <th className="px-4 py-2 text-left text-sm font-medium text-[color:var(--color-text-secondary)]">視覚化</th>
              </tr>
            </thead>
            <tbody>
              {data.summary.map((step) => {
                const conversionColor =
                  step.conversionRate === null
                    ? ''
                    : step.conversionRate >= 50
                      ? 'text-green-600'
                      : step.conversionRate >= 20
                        ? 'text-yellow-600'
                        : 'text-red-600';
                return (
                  <tr key={step.label} className="border-b border-[color:var(--color-border)] hover:bg-[color:var(--color-bg-hover)]">
                    <td className="px-4 py-2 text-sm font-medium text-[color:var(--color-text-primary)]">{step.label}</td>
                    <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-[color:var(--color-text-primary)]">
                      {formatNumber(step.count)}
                    </td>
                    <td className={`px-4 py-2 text-right text-sm tabular-nums ${conversionColor}`}>
                      {step.conversionRate === null
                        ? '-'
                        : step.conversionRate > 100
                          ? formatPercent(step.conversionRate)
                          : `↓ ${formatPercent(step.conversionRate)}`}
                    </td>
                    <td className="px-4 py-2 text-right text-sm tabular-nums text-[color:var(--color-text-secondary)]">
                      {formatPercent(step.overallRate)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="relative h-5 w-full max-w-[240px] overflow-hidden rounded bg-gray-100">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${(step.count / maxSummaryCount) * 100}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* パネル別タップ状況 */}
      <div className="grid gap-4 xl:grid-cols-2">
        {data.sections.map((section) => {
          const sectionMax = Math.max(...section.items.map((i) => i.count), 1);
          return (
            <Card key={section.title} className="p-6">
              <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">{section.title}</h3>
              <table className="mt-3 w-full border-collapse">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)]">
                    <th className="py-2 pr-2 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">パネル</th>
                    <th className="py-2 pr-2 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">タップ数</th>
                    <th className="py-2 pr-2 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">全体比</th>
                    <th className="py-2 text-left text-xs font-medium text-[color:var(--color-text-secondary)]" style={{ width: '30%' }} />
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <tr key={item.label} className="border-b border-[color:var(--color-border)] last:border-0">
                      <td className="py-2 pr-2 text-sm text-[color:var(--color-text-primary)]">
                        {item.label}
                        {item.missing ? (
                          <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">データ未取込</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-2 text-right text-sm font-semibold tabular-nums text-[color:var(--color-text-primary)]">
                        {formatNumber(item.count)}
                      </td>
                      <td className="py-2 pr-2 text-right text-xs tabular-nums text-[color:var(--color-text-secondary)]">
                        {formatPercent(item.rate)}
                      </td>
                      <td className="py-2">
                        <div className="relative h-3 w-full overflow-hidden rounded bg-gray-100">
                          <div
                            className="h-full bg-sky-500"
                            style={{ width: `${(item.count / sectionMax) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}
      </div>

      {data.missingColumns.length > 0 ? (
        <Card className="p-4">
          <p className="text-xs text-amber-700">
            未取込カラム（次回のCSV取り込みで反映予定）: {data.missingColumns.join(', ')}
          </p>
        </Card>
      ) : null}
    </div>
  );
}
