'use client';

import { useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import type { FunnelDefinition, FunnelAnalysisResult } from '@/lib/lstep/funnel-types';

// --- Types ---

export type SegmentFilterType = 'all' | 'new' | 'existing';

export interface FunnelComparisonProps {
  funnelDefinition: FunnelDefinition;
  defaultPeriodA?: { start: string; end: string };
  defaultPeriodB?: { start: string; end: string };
  segmentFilter?: SegmentFilterType;
  segmentCutoffDate?: string;
  /** コールバック: セグメントフィルタ変更時 */
  onSegmentFilterChange?: (filter: SegmentFilterType) => void;
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

function getDateNDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

// --- Component ---

export function FunnelComparison({
  funnelDefinition,
  defaultPeriodA,
  defaultPeriodB,
  segmentFilter = 'all',
  segmentCutoffDate,
  onSegmentFilterChange,
}: FunnelComparisonProps) {
  const [periodAStart, setPeriodAStart] = useState(defaultPeriodA?.start ?? getDateNDaysAgo(60));
  const [periodAEnd, setPeriodAEnd] = useState(defaultPeriodA?.end ?? getDateNDaysAgo(31));
  const [periodBStart, setPeriodBStart] = useState(defaultPeriodB?.start ?? getDateNDaysAgo(30));
  const [periodBEnd, setPeriodBEnd] = useState(defaultPeriodB?.end ?? getDateNDaysAgo(1));

  const [resultA, setResultA] = useState<FunnelAnalysisResult | null>(null);
  const [resultB, setResultB] = useState<FunnelAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runComparison = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const commonBody = {
        funnelDefinition,
        ...(segmentFilter !== 'all' && segmentCutoffDate
          ? { segmentFilter, segmentCutoffDate }
          : {}),
      };

      const [resA, resB] = await Promise.all([
        fetch('/api/line/funnel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...commonBody,
            startDate: periodAStart,
            endDate: periodAEnd,
          }),
        }),
        fetch('/api/line/funnel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...commonBody,
            startDate: periodBStart,
            endDate: periodBEnd,
          }),
        }),
      ]);

      if (!resA.ok || !resB.ok) throw new Error('比較データの取得に失敗しました');

      const [dataA, dataB] = await Promise.all([
        resA.json() as Promise<FunnelAnalysisResult>,
        resB.json() as Promise<FunnelAnalysisResult>,
      ]);

      setResultA(dataA);
      setResultB(dataB);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [funnelDefinition, periodAStart, periodAEnd, periodBStart, periodBEnd, segmentFilter, segmentCutoffDate]);

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          期間比較ファネル分析
        </h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          {funnelDefinition.name} - 2つの期間を比較して、ファネルの変化を分析します。
        </p>
      </div>

      {/* セグメントフィルタ */}
      {onSegmentFilterChange && (
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-[color:var(--color-text-muted)]">対象:</span>
          <div className="flex gap-1.5">
            {(['all', 'new', 'existing'] as const).map((filter) => {
              const labels: Record<SegmentFilterType, string> = {
                all: '全体',
                new: '新規',
                existing: '既存',
              };
              const isActive = segmentFilter === filter;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => onSegmentFilterChange(filter)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-gray-900 text-white'
                      : 'border border-[color:var(--color-border)] text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-muted)]'
                  }`}
                >
                  {labels[filter]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 期間設定 */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* A期間 */}
        <div className="space-y-3 p-4 rounded-[var(--radius-md)] bg-blue-50 border border-blue-200">
          <h4 className="text-sm font-semibold text-blue-700">A期間（過去）</h4>
          <div className="grid gap-2 grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-blue-600">開始日</span>
              <input
                type="date"
                value={periodAStart}
                onChange={(e) => setPeriodAStart(e.target.value)}
                className="rounded-[var(--radius-sm)] border border-blue-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-blue-600">終了日</span>
              <input
                type="date"
                value={periodAEnd}
                onChange={(e) => setPeriodAEnd(e.target.value)}
                className="rounded-[var(--radius-sm)] border border-blue-300 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
        </div>

        {/* B期間 */}
        <div className="space-y-3 p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200">
          <h4 className="text-sm font-semibold text-green-700">B期間（最近）</h4>
          <div className="grid gap-2 grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-green-600">開始日</span>
              <input
                type="date"
                value={periodBStart}
                onChange={(e) => setPeriodBStart(e.target.value)}
                className="rounded-[var(--radius-sm)] border border-green-300 px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-green-600">終了日</span>
              <input
                type="date"
                value={periodBEnd}
                onChange={(e) => setPeriodBEnd(e.target.value)}
                className="rounded-[var(--radius-sm)] border border-green-300 px-2 py-1.5 text-sm"
              />
            </label>
          </div>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={runComparison}
          disabled={loading}
          className="px-4 py-2 bg-gray-900 text-white rounded-[var(--radius-sm)] text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
        >
          {loading ? '分析中...' : '比較分析を実行'}
        </button>
      </div>

      {error && (
        <p className="text-sm text-[color:var(--color-danger)]">エラー: {error}</p>
      )}

      {/* 比較結果 */}
      {resultA && resultB && (
        <div className="space-y-4">
          {/* サマリー */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-4 rounded-[var(--radius-md)] bg-blue-50 border border-blue-200">
              <p className="text-xs font-medium text-blue-600 mb-2">
                A期間: {periodAStart} ~ {periodAEnd}
              </p>
              <p className="text-2xl font-bold text-blue-700">
                {formatNumber(resultA.totalBase)}人
              </p>
              <p className="text-xs text-blue-600">計測対象</p>
            </div>
            <div className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200">
              <p className="text-xs font-medium text-green-600 mb-2">
                B期間: {periodBStart} ~ {periodBEnd}
              </p>
              <p className="text-2xl font-bold text-green-700">
                {formatNumber(resultB.totalBase)}人
              </p>
              <p className="text-xs text-green-600">計測対象</p>
              {(() => {
                const diff = resultB.totalBase - resultA.totalBase;
                const pct =
                  resultA.totalBase > 0
                    ? (diff / resultA.totalBase) * 100
                    : 0;
                return (
                  <p
                    className={`text-xs mt-1 ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {diff >= 0 ? '+' : ''}
                    {formatNumber(diff)} ({diff >= 0 ? '+' : ''}
                    {formatPercent(pct)})
                  </p>
                );
              })()}
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
                      A期間
                    </th>
                    <th className="w-4"></th>
                    <th
                      className="px-3 py-3 text-center text-xs font-medium text-green-600 bg-green-50"
                      colSpan={3}
                    >
                      B期間
                    </th>
                    <th
                      className="px-3 py-3 text-center text-xs font-medium text-[color:var(--color-text-secondary)]"
                      colSpan={2}
                    >
                      差分
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
                    <th className="px-3 py-2 text-right text-green-600 bg-green-50">
                      到達数
                    </th>
                    <th className="px-3 py-2 text-right text-green-600 bg-green-50">
                      移行率
                    </th>
                    <th className="px-3 py-2 text-right text-green-600 bg-green-50">
                      全体比
                    </th>
                    <th className="px-3 py-2 text-right">移行率差</th>
                    <th className="px-3 py-2 text-right">全体比差</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)] text-sm">
                  {resultA.steps.map((stepA, index) => {
                    const stepB = resultB.steps[index];
                    if (!stepB) return null;
                    const isFirst = index === 0;
                    const rateDiff =
                      stepB.conversionRate - stepA.conversionRate;
                    const overallDiff =
                      stepB.overallRate - stepA.overallRate;

                    return (
                      <tr
                        key={stepA.stepId}
                        className="hover:bg-[color:var(--color-surface-muted)]"
                      >
                        <td className="px-3 py-3 text-[color:var(--color-text-secondary)]">
                          {index}
                        </td>
                        <td className="px-3 py-3 font-medium text-[color:var(--color-text-primary)]">
                          {stepA.label}
                        </td>
                        <td className="px-3 py-3 text-right bg-blue-50/50">
                          {formatNumber(stepA.reached)}
                        </td>
                        <td className="px-3 py-3 text-right bg-blue-50/50">
                          {isFirst
                            ? '-'
                            : formatPercent(stepA.conversionRate)}
                        </td>
                        <td className="px-3 py-3 text-right bg-blue-50/50">
                          {formatPercent(stepA.overallRate)}
                        </td>
                        <td className="w-4"></td>
                        <td className="px-3 py-3 text-right bg-green-50/50">
                          {formatNumber(stepB.reached)}
                        </td>
                        <td className="px-3 py-3 text-right bg-green-50/50">
                          {isFirst
                            ? '-'
                            : formatPercent(stepB.conversionRate)}
                        </td>
                        <td className="px-3 py-3 text-right bg-green-50/50">
                          {formatPercent(stepB.overallRate)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {isFirst ? (
                            '-'
                          ) : (
                            <span
                              className={
                                rateDiff >= 0
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }
                            >
                              {rateDiff >= 0 ? '+' : ''}
                              {formatPercent(rateDiff)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {isFirst ? (
                            '-'
                          ) : (
                            <span
                              className={
                                overallDiff >= 0
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }
                            >
                              {overallDiff >= 0 ? '+' : ''}
                              {formatPercent(overallDiff)}
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

          {/* 全体比の視覚的な比較 */}
          <div>
            <h4 className="text-sm font-semibold text-[color:var(--color-text-primary)] mb-4">
              全体比の比較
            </h4>
            <div className="grid gap-6 md:grid-cols-2">
              {/* A期間 */}
              <div className="p-4 rounded-[var(--radius-md)] bg-blue-50 border border-blue-200">
                <h5 className="text-sm font-semibold text-blue-700 mb-3">
                  A期間
                </h5>
                <div className="space-y-3">
                  {resultA.steps.map((step, index) => (
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

              {/* B期間 */}
              <div className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200">
                <h5 className="text-sm font-semibold text-green-700 mb-3">
                  B期間
                </h5>
                <div className="space-y-3">
                  {resultB.steps.map((step, index) => {
                    const stepA = resultA.steps[index];
                    const diff = stepA
                      ? step.overallRate - stepA.overallRate
                      : 0;
                    return (
                      <div key={step.stepId} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="text-green-700">
                            {index}. {step.label}
                          </span>
                          <span className="font-semibold text-green-800">
                            {formatPercent(step.overallRate)}
                            {index > 0 && (
                              <span
                                className={`ml-2 ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`}
                              >
                                ({diff >= 0 ? '+' : ''}
                                {formatPercent(diff)})
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="h-4 bg-green-100 rounded overflow-hidden">
                          <div
                            className="h-full bg-green-500 transition-all"
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
