'use client';

/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import { useState, useCallback, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import type { FunnelDefinition, FunnelAnalysisResult } from '@/lib/lstep/funnel-types';

// --- Types ---

export type SegmentFilterType = 'all' | 'new' | 'existing';

export interface FunnelComparisonProps {
  funnelDefinition: FunnelDefinition;
  /** ローンチ開始日 — この日付を基準に既存/新規を分割 */
  cutoffDate: string;
  /** 自動取得を実行するか（trueで初回マウント時に取得） */
  autoFetch?: boolean;
}

// --- Helpers ---

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

// --- Component ---

export function FunnelComparison({
  funnelDefinition,
  cutoffDate,
  autoFetch = true,
}: FunnelComparisonProps) {
  const [resultExisting, setResultExisting] = useState<FunnelAnalysisResult | null>(null);
  const [resultNew, setResultNew] = useState<FunnelAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runComparison = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [resExisting, resNew] = await Promise.all([
        fetch('/api/line/funnel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            funnelDefinition,
            segmentFilter: 'existing',
            segmentCutoffDate: cutoffDate,
          }),
        }),
        fetch('/api/line/funnel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            funnelDefinition,
            segmentFilter: 'new',
            segmentCutoffDate: cutoffDate,
          }),
        }),
      ]);

      if (!resExisting.ok || !resNew.ok) throw new Error('比較データの取得に失敗しました');

      const [dataExisting, dataNew] = await Promise.all([
        resExisting.json() as Promise<FunnelAnalysisResult>,
        resNew.json() as Promise<FunnelAnalysisResult>,
      ]);

      setResultExisting(dataExisting);
      setResultNew(dataNew);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [funnelDefinition, cutoffDate]);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch && !resultExisting && !resultNew && !loading) {
      runComparison();
    }
  }, [autoFetch, resultExisting, resultNew, loading, runComparison]);

  return (
    <Card className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--color-text-primary)]">
            既存LINE vs 新規LINE ファネル比較
          </h2>
          <p className="mt-0.5 text-xs text-[color:var(--color-text-muted)]">
            基準日: {cutoffDate}（この日以降の登録 = 新規）
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setResultExisting(null); setResultNew(null); runComparison(); }}
          disabled={loading}
          className="px-3 py-1.5 bg-gray-900 text-white rounded-[var(--radius-sm)] text-xs font-medium hover:bg-gray-800 transition disabled:opacity-50"
        >
          {loading ? '読込中...' : '更新'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-[color:var(--color-danger)]">エラー: {error}</p>
      )}

      {loading && !resultExisting && (
        <div className="flex items-center justify-center py-12 text-sm text-[color:var(--color-text-muted)]">
          読み込み中...
        </div>
      )}

      {/* 比較結果 */}
      {resultExisting && resultNew && (
        <div className="space-y-5">
          {/* サマリーカード */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 rounded-[var(--radius-md)] bg-blue-50 border border-blue-200">
              <p className="text-xs font-medium text-blue-600 mb-1">既存LINE</p>
              <p className="text-2xl font-bold text-blue-700">
                {formatNumber(resultExisting.totalBase)}人
              </p>
              <p className="text-[10px] text-blue-500">
                {cutoffDate} より前に登録
              </p>
            </div>
            <div className="p-4 rounded-[var(--radius-md)] bg-emerald-50 border border-emerald-200">
              <p className="text-xs font-medium text-emerald-600 mb-1">新規LINE</p>
              <p className="text-2xl font-bold text-emerald-700">
                {formatNumber(resultNew.totalBase)}人
              </p>
              <p className="text-[10px] text-emerald-500">
                {cutoffDate} 以降に登録
              </p>
            </div>
          </div>

          {/* 比較テーブル */}
          <div className="overflow-x-auto">
            <div className="mx-auto min-w-[1088px] max-w-[1200px]">
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[48px]" />
                  <col className="w-[200px]" />
                  <col className="w-[96px]" />
                  <col className="w-[96px]" />
                  <col className="w-[96px]" />
                  <col className="w-[16px]" />
                  <col className="w-[96px]" />
                  <col className="w-[96px]" />
                  <col className="w-[96px]" />
                  <col className="w-[124px]" />
                  <col className="w-[124px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] bg-gray-50">
                    <th className="px-3 py-3 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">
                      #
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">
                      ステップ
                    </th>
                    <th
                      className="px-3 py-3 text-center text-xs font-medium text-blue-600 bg-blue-50"
                      colSpan={3}
                    >
                      既存LINE
                    </th>
                    <th className="w-4"></th>
                    <th
                      className="px-3 py-3 text-center text-xs font-medium text-emerald-600 bg-emerald-50"
                      colSpan={3}
                    >
                      新規LINE
                    </th>
                    <th
                      className="px-3 py-3 text-center text-xs font-medium text-[color:var(--color-text-secondary)]"
                      colSpan={2}
                    >
                      差分（新規-既存）
                    </th>
                  </tr>
                  <tr className="border-b border-[color:var(--color-border)] bg-gray-50 text-xs">
                    <th className="px-3 py-2"></th>
                    <th className="px-3 py-2"></th>
                    <th className="px-3 py-2 text-right text-blue-600 bg-blue-50">
                      到達数
                    </th>
                    <th className="px-3 py-2 text-right text-blue-600 bg-blue-50">
                      移行率
                    </th>
                    <th className="px-3 py-2 text-right text-blue-600 bg-blue-50">
                      全体比
                    </th>
                    <th className="w-4"></th>
                    <th className="px-3 py-2 text-right text-emerald-600 bg-emerald-50">
                      到達数
                    </th>
                    <th className="px-3 py-2 text-right text-emerald-600 bg-emerald-50">
                      移行率
                    </th>
                    <th className="px-3 py-2 text-right text-emerald-600 bg-emerald-50">
                      全体比
                    </th>
                    <th className="px-3 py-2 text-right">移行率差</th>
                    <th className="px-3 py-2 text-right">全体比差</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)] text-sm">
                  {resultExisting.steps.map((stepE, index) => {
                    const stepN = resultNew.steps[index];
                    if (!stepN) return null;
                    const isFirst = index === 0;
                    const rateDiff = stepN.conversionRate - stepE.conversionRate;
                    const overallDiff = stepN.overallRate - stepE.overallRate;

                    return (
                      <tr
                        key={stepE.stepId}
                        className="hover:bg-[color:var(--color-surface-muted)]"
                      >
                        <td className="px-3 py-3 text-[color:var(--color-text-secondary)]">
                          {index}
                        </td>
                        <td className="px-3 py-3 font-medium text-[color:var(--color-text-primary)]">
                          {stepE.label}
                        </td>
                        {/* 既存 */}
                        <td className="px-3 py-3 text-right bg-blue-50/50">
                          {formatNumber(stepE.reached)}
                        </td>
                        <td className="px-3 py-3 text-right bg-blue-50/50">
                          {isFirst ? '-' : formatPercent(stepE.conversionRate)}
                        </td>
                        <td className="px-3 py-3 text-right bg-blue-50/50">
                          {formatPercent(stepE.overallRate)}
                        </td>
                        <td className="w-4"></td>
                        {/* 新規 */}
                        <td className="px-3 py-3 text-right bg-emerald-50/50">
                          {formatNumber(stepN.reached)}
                        </td>
                        <td className="px-3 py-3 text-right bg-emerald-50/50">
                          {isFirst ? '-' : formatPercent(stepN.conversionRate)}
                        </td>
                        <td className="px-3 py-3 text-right bg-emerald-50/50">
                          {formatPercent(stepN.overallRate)}
                        </td>
                        {/* 差分 */}
                        <td className="px-3 py-3 text-right">
                          {isFirst ? (
                            '-'
                          ) : (
                            <span className={rateDiff >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                              {rateDiff >= 0 ? '+' : ''}{formatPercent(rateDiff)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {isFirst ? (
                            '-'
                          ) : (
                            <span className={overallDiff >= 0 ? 'text-emerald-600' : 'text-red-600'}>
                              {overallDiff >= 0 ? '+' : ''}{formatPercent(overallDiff)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 全体比の視覚的な比較（左右分割バー） */}
          <div>
            <h4 className="text-sm font-semibold text-[color:var(--color-text-primary)] mb-4">
              全体比の比較
            </h4>
            <div className="grid gap-6 md:grid-cols-2">
              {/* 既存LINE */}
              <div className="p-4 rounded-[var(--radius-md)] bg-blue-50 border border-blue-200">
                <h5 className="text-sm font-semibold text-blue-700 mb-3">
                  既存LINE
                </h5>
                <div className="space-y-3">
                  {resultExisting.steps.map((step, index) => (
                    <div key={step.stepId} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-blue-700">
                          {index}. {step.label}
                        </span>
                        <span className="font-semibold text-blue-800">
                          {formatPercent(step.overallRate)}
                        </span>
                      </div>
                      <div className="h-4 bg-blue-100 rounded overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all"
                          style={{ width: `${step.overallRate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 新規LINE */}
              <div className="p-4 rounded-[var(--radius-md)] bg-emerald-50 border border-emerald-200">
                <h5 className="text-sm font-semibold text-emerald-700 mb-3">
                  新規LINE
                </h5>
                <div className="space-y-3">
                  {resultNew.steps.map((step, index) => {
                    const stepE = resultExisting.steps[index];
                    const diff = stepE ? step.overallRate - stepE.overallRate : 0;
                    return (
                      <div key={step.stepId} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-emerald-700">
                            {index}. {step.label}
                          </span>
                          <span className="font-semibold text-emerald-800">
                            {formatPercent(step.overallRate)}
                            {index > 0 && (
                              <span
                                className={`ml-2 ${diff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}
                              >
                                ({diff >= 0 ? '+' : ''}{formatPercent(diff)})
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="h-4 bg-emerald-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 transition-all"
                            style={{ width: `${step.overallRate}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
