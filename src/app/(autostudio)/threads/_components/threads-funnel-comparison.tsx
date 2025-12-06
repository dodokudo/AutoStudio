'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { classNames } from '@/lib/classNames';

interface FunnelData {
  impressions: number;
  linkClicks: number;
  lineRegistrations: number;
  followerDelta: number;
  postCount: number;
}

interface ThreadsFunnelComparisonProps {
  /** 現在の期間選択の開始日 */
  currentStartDate: string;
  /** 現在の期間選択の終了日 */
  currentEndDate: string;
}

const COMPARISON_DATES_KEY = 'threads-funnel-comparison-dates';

interface ComparisonDates {
  periodAStart: string;
  periodAEnd: string;
  periodBStart: string;
  periodBEnd: string;
}

function getDateNDaysAgo(n: number): string {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date.toISOString().slice(0, 10);
}

function loadComparisonDates(): ComparisonDates | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(COMPARISON_DATES_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as ComparisonDates;
  } catch {
    return null;
  }
}

function saveComparisonDates(dates: ComparisonDates): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COMPARISON_DATES_KEY, JSON.stringify(dates));
  } catch {
    // ignore
  }
}

export function ThreadsFunnelComparison({
  currentStartDate: _currentStartDate,
  currentEndDate: _currentEndDate,
}: ThreadsFunnelComparisonProps) {
  const [showComparison, setShowComparison] = useState(false);
  const [periodAStart, setPeriodAStart] = useState(() => {
    const saved = loadComparisonDates();
    return saved?.periodAStart ?? getDateNDaysAgo(60);
  });
  const [periodAEnd, setPeriodAEnd] = useState(() => {
    const saved = loadComparisonDates();
    return saved?.periodAEnd ?? getDateNDaysAgo(31);
  });
  const [periodBStart, setPeriodBStart] = useState(() => {
    const saved = loadComparisonDates();
    return saved?.periodBStart ?? getDateNDaysAgo(30);
  });
  const [periodBEnd, setPeriodBEnd] = useState(() => {
    const saved = loadComparisonDates();
    return saved?.periodBEnd ?? getDateNDaysAgo(1);
  });

  const [dataA, setDataA] = useState<FunnelData | null>(null);
  const [dataB, setDataB] = useState<FunnelData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 日付変更時に保存
  useEffect(() => {
    saveComparisonDates({
      periodAStart,
      periodAEnd,
      periodBStart,
      periodBEnd,
    });
  }, [periodAStart, periodAEnd, periodBStart, periodBEnd]);

  const fetchFunnelData = useCallback(async (startDate: string, endDate: string): Promise<FunnelData> => {
    const response = await fetch(`/api/threads/funnel?startDate=${startDate}&endDate=${endDate}`);
    if (!response.ok) {
      throw new Error('Failed to fetch funnel data');
    }
    return response.json();
  }, []);

  const runComparison = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [resultA, resultB] = await Promise.all([
        fetchFunnelData(periodAStart, periodAEnd),
        fetchFunnelData(periodBStart, periodBEnd),
      ]);

      setDataA(resultA);
      setDataB(resultB);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [periodAStart, periodAEnd, periodBStart, periodBEnd, fetchFunnelData]);

  const formatNumber = (value: number) => new Intl.NumberFormat('ja-JP').format(value);
  const formatPercent = (value: number) => `${value.toFixed(2)}%`;

  const getDiff = (a: number, b: number): { value: number; isPositive: boolean } => {
    const diff = b - a;
    return { value: diff, isPositive: diff >= 0 };
  };

  const getConversionRate = (numerator: number, denominator: number): number => {
    if (denominator === 0) return 0;
    return (numerator / denominator) * 100;
  };

  const funnelSteps = [
    { id: 'postCount', label: '投稿数', getValueA: () => dataA?.postCount ?? 0, getValueB: () => dataB?.postCount ?? 0, isFunnel: false },
    { id: 'followerDelta', label: 'フォロワー増加数', getValueA: () => dataA?.followerDelta ?? 0, getValueB: () => dataB?.followerDelta ?? 0, isFunnel: false },
    { id: 'impressions', label: 'インプレッション', getValueA: () => dataA?.impressions ?? 0, getValueB: () => dataB?.impressions ?? 0, isFunnel: true },
    { id: 'linkClicks', label: 'リンククリック', getValueA: () => dataA?.linkClicks ?? 0, getValueB: () => dataB?.linkClicks ?? 0, isFunnel: true },
    { id: 'lineRegistrations', label: 'LINE登録', getValueA: () => dataA?.lineRegistrations ?? 0, getValueB: () => dataB?.lineRegistrations ?? 0, isFunnel: true },
  ];

  // ファネル部分のみ（インプレッション〜LINE登録）の遷移率計算用
  const funnelOnlySteps = funnelSteps.filter(s => s.isFunnel);

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
            期間別ファネル比較
          </h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
            2つの期間のパフォーマンスを比較して改善点を発見します
          </p>
        </div>
        <button
          onClick={() => setShowComparison(!showComparison)}
          className="rounded-[var(--radius-md)] bg-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
        >
          {showComparison ? '比較を閉じる' : '期間を比較する'}
        </button>
      </div>

      {showComparison && (
        <div className="mt-6 space-y-6">
          {/* 期間選択 */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* A期間 */}
            <div className="rounded-[var(--radius-md)] border-2 border-blue-200 bg-blue-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-blue-700">A期間（過去）</h3>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={periodAStart}
                  onChange={(e) => setPeriodAStart(e.target.value)}
                  className="flex-1 rounded-[var(--radius-md)] border border-blue-200 bg-white px-3 py-2 text-sm"
                />
                <span className="text-sm text-blue-600">〜</span>
                <input
                  type="date"
                  value={periodAEnd}
                  onChange={(e) => setPeriodAEnd(e.target.value)}
                  className="flex-1 rounded-[var(--radius-md)] border border-blue-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* B期間 */}
            <div className="rounded-[var(--radius-md)] border-2 border-green-200 bg-green-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-green-700">B期間（最近）</h3>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={periodBStart}
                  onChange={(e) => setPeriodBStart(e.target.value)}
                  className="flex-1 rounded-[var(--radius-md)] border border-green-200 bg-white px-3 py-2 text-sm"
                />
                <span className="text-sm text-green-600">〜</span>
                <input
                  type="date"
                  value={periodBEnd}
                  onChange={(e) => setPeriodBEnd(e.target.value)}
                  className="flex-1 rounded-[var(--radius-md)] border border-green-200 bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* 比較実行ボタン */}
          <div className="flex justify-center">
            <button
              onClick={runComparison}
              disabled={loading}
              className="rounded-[var(--radius-md)] bg-[color:var(--color-text-primary)] px-6 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {loading ? '分析中...' : '比較を実行'}
            </button>
          </div>

          {error && (
            <div className="rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* 比較結果 */}
          {dataA && dataB && !loading && (
            <div className="space-y-6">
              {/* ファネル比較テーブル */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-[color:var(--color-text-primary)]">
                  コンバージョンファネル
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[800px] text-sm">
                    <thead>
                      <tr className="border-b border-[color:var(--color-border)] bg-gray-50">
                        <th className="px-3 py-2 text-left font-medium text-[color:var(--color-text-secondary)]">
                          ステップ
                        </th>
                        <th className="bg-blue-50 px-3 py-2 text-right font-medium text-blue-700">
                          到達数
                        </th>
                        <th className="bg-blue-50 px-3 py-2 text-right font-medium text-blue-700">
                          移行率
                        </th>
                        <th className="bg-blue-50 px-3 py-2 text-right font-medium text-blue-700">
                          全体比
                        </th>
                        <th className="w-4" />
                        <th className="bg-green-50 px-3 py-2 text-right font-medium text-green-700">
                          到達数
                        </th>
                        <th className="bg-green-50 px-3 py-2 text-right font-medium text-green-700">
                          移行率
                        </th>
                        <th className="bg-green-50 px-3 py-2 text-right font-medium text-green-700">
                          全体比
                        </th>
                        <th className="px-3 py-2 text-right font-medium text-[color:var(--color-text-secondary)]">
                          増減
                        </th>
                        <th className="px-3 py-2 text-right font-medium text-[color:var(--color-text-secondary)]">
                          移行率差
                        </th>
                        <th className="px-3 py-2 text-right font-medium text-[color:var(--color-text-secondary)]">
                          全体比差
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--color-border)]">
                      {funnelSteps.map((step) => {
                        const valueA = step.getValueA();
                        const valueB = step.getValueB();
                        const valueDiff = getDiff(valueA, valueB);

                        // ファネル部分のみ遷移率を計算
                        let rateA = 0;
                        let rateB = 0;
                        let showRate = false;

                        // 全体比（ファネルの起点からの割合）
                        const baseA = funnelOnlySteps[0]?.getValueA() ?? 0;
                        const baseB = funnelOnlySteps[0]?.getValueB() ?? 0;
                        const totalRateA = step.isFunnel ? getConversionRate(valueA, baseA) : 0;
                        const totalRateB = step.isFunnel ? getConversionRate(valueB, baseB) : 0;

                        if (step.isFunnel) {
                          const funnelIndex = funnelOnlySteps.findIndex(s => s.id === step.id);
                          if (funnelIndex > 0) {
                            const prevStep = funnelOnlySteps[funnelIndex - 1];
                            rateA = getConversionRate(valueA, prevStep.getValueA());
                            rateB = getConversionRate(valueB, prevStep.getValueB());
                            showRate = true;
                          }
                        }

                        const rateDiff = getDiff(rateA, rateB);
                        const totalRateDiff = getDiff(totalRateA, totalRateB);
                        const isImpression = step.id === 'impressions';

                        return (
                          <tr key={step.id} className="hover:bg-[color:var(--color-surface-muted)]">
                            <td className="px-3 py-3 font-medium text-[color:var(--color-text-primary)]">
                              {step.label}
                            </td>
                            {/* A期間 */}
                            <td className="bg-blue-50/50 px-3 py-3 text-right">
                              {formatNumber(valueA)}
                            </td>
                            <td className="bg-blue-50/50 px-3 py-3 text-right text-[color:var(--color-text-secondary)]">
                              {showRate ? formatPercent(rateA) : '-'}
                            </td>
                            <td className="bg-blue-50/50 px-3 py-3 text-right text-[color:var(--color-text-secondary)]">
                              {step.isFunnel ? (isImpression ? '100.0%' : formatPercent(totalRateA)) : '-'}
                            </td>
                            <td />
                            {/* B期間 */}
                            <td className="bg-green-50/50 px-3 py-3 text-right">
                              {formatNumber(valueB)}
                            </td>
                            <td className="bg-green-50/50 px-3 py-3 text-right text-[color:var(--color-text-secondary)]">
                              {showRate ? formatPercent(rateB) : '-'}
                            </td>
                            <td className="bg-green-50/50 px-3 py-3 text-right text-[color:var(--color-text-secondary)]">
                              {step.isFunnel ? (isImpression ? '100.0%' : formatPercent(totalRateB)) : '-'}
                            </td>
                            {/* 差分 */}
                            <td className="px-3 py-3 text-right">
                              <span className={valueDiff.isPositive ? 'text-green-600' : 'text-red-600'}>
                                {valueDiff.isPositive ? '+' : ''}{formatNumber(valueDiff.value)}
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right">
                              {showRate ? (
                                <span className={rateDiff.isPositive ? 'text-green-600' : 'text-red-600'}>
                                  {rateDiff.isPositive ? '+' : ''}{formatPercent(rateDiff.value)}
                                </span>
                              ) : '-'}
                            </td>
                            <td className="px-3 py-3 text-right">
                              {step.isFunnel && !isImpression ? (
                                <span className={totalRateDiff.isPositive ? 'text-green-600' : 'text-red-600'}>
                                  {totalRateDiff.isPositive ? '+' : ''}{formatPercent(totalRateDiff.value)}
                                </span>
                              ) : '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 視覚的な比較 */}
              <div className="grid gap-4 md:grid-cols-2">
                {/* A期間 */}
                <div className="rounded-[var(--radius-md)] border border-blue-200 bg-blue-50 p-4">
                  <h4 className="mb-3 text-sm font-semibold text-blue-700">A期間 ファネル</h4>
                  <div className="space-y-3">
                    {funnelOnlySteps.map((step, index) => {
                      const value = step.getValueA();
                      const maxValue = funnelOnlySteps[0].getValueA();
                      const width = maxValue > 0 ? (value / maxValue) * 100 : 0;
                      const prevValue = index > 0 ? funnelOnlySteps[index - 1].getValueA() : value;
                      const rate = index === 0 ? 100 : getConversionRate(value, prevValue);

                      return (
                        <div key={step.id}>
                          <div className="flex justify-between text-xs">
                            <span className="text-blue-700">{step.label}</span>
                            <span className="font-semibold text-blue-800">
                              {formatNumber(value)}
                              {index > 0 && (
                                <span className="ml-1 font-normal text-blue-600">
                                  ({formatPercent(rate)})
                                </span>
                              )}
                            </span>
                          </div>
                          <div className="mt-1 h-4 overflow-hidden rounded bg-blue-100">
                            <div
                              className="h-full bg-blue-500 transition-all"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* B期間 */}
                <div className="rounded-[var(--radius-md)] border border-green-200 bg-green-50 p-4">
                  <h4 className="mb-3 text-sm font-semibold text-green-700">B期間 ファネル</h4>
                  <div className="space-y-3">
                    {funnelOnlySteps.map((step, index) => {
                      const value = step.getValueB();
                      const maxValue = funnelOnlySteps[0].getValueB();
                      const width = maxValue > 0 ? (value / maxValue) * 100 : 0;
                      const prevValue = index > 0 ? funnelOnlySteps[index - 1].getValueB() : value;
                      const rate = index === 0 ? 100 : getConversionRate(value, prevValue);

                      const valueA = step.getValueA();
                      const prevValueA = index > 0 ? funnelOnlySteps[index - 1].getValueA() : valueA;
                      const rateA = index === 0 ? 100 : getConversionRate(valueA, prevValueA);
                      const rateDiff = getDiff(rateA, rate);

                      return (
                        <div key={step.id}>
                          <div className="flex justify-between text-xs">
                            <span className="text-green-700">{step.label}</span>
                            <span className="font-semibold text-green-800">
                              {formatNumber(value)}
                              {index > 0 && (
                                <>
                                  <span className="ml-1 font-normal text-green-600">
                                    ({formatPercent(rate)})
                                  </span>
                                  <span className={classNames(
                                    'ml-1',
                                    rateDiff.isPositive ? 'text-green-600' : 'text-red-500'
                                  )}>
                                    {rateDiff.isPositive ? '+' : ''}{formatPercent(rateDiff.value)}
                                  </span>
                                </>
                              )}
                            </span>
                          </div>
                          <div className="mt-1 h-4 overflow-hidden rounded bg-green-100">
                            <div
                              className="h-full bg-green-500 transition-all"
                              style={{ width: `${width}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
