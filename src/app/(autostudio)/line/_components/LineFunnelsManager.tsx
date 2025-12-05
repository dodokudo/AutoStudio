'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type {
  FunnelDefinition,
  FunnelStep,
  FunnelAnalysisResult,
} from '@/lib/lstep/funnel';

const fetcher = async (input: RequestInfo) => {
  const res = await fetch(input.toString());
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
};

interface FunnelStepForm {
  id: string;
  label: string;
  tagColumn: string;
}

interface FunnelFormState {
  id?: string;
  name: string;
  description?: string;
  steps: FunnelStepForm[];
}

interface LineFunnelsManagerProps {
  startDate: string;
  endDate: string;
}

interface FunnelListResponse {
  custom: FunnelDefinition[];
}

interface TagColumnOption {
  column: string;
  label: string;
}

interface TagColumnsResponse {
  columns: TagColumnOption[];
}

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

function toStepForm(step: FunnelStep): FunnelStepForm {
  return {
    id: step.id,
    label: step.label,
    tagColumn: step.tagColumn,
  };
}

// 日付を30日前に設定するユーティリティ
function getDateNDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

// ローカルストレージのキー
const COMPARISON_DATES_KEY = 'line-funnel-comparison-dates';

interface ComparisonDates {
  periodAStart: string;
  periodAEnd: string;
  periodBStart: string;
  periodBEnd: string;
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

export function LineFunnelsManager({ startDate, endDate }: LineFunnelsManagerProps) {
  const { data: funnelListData, mutate: mutateFunnels } = useSWR<FunnelListResponse>(
    '/api/line/funnel',
    fetcher,
  );

  const { data: tagColumnsData } = useSWR<TagColumnsResponse>(
    '/api/line/funnel/options',
    fetcher,
  );

  const funnels = useMemo(() => funnelListData?.custom ?? [], [funnelListData]);
  const tagColumns = useMemo(() => tagColumnsData?.columns ?? [], [tagColumnsData]);

  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [editingFunnel, setEditingFunnel] = useState<FunnelFormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<FunnelAnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // 期間比較用の状態（ローカルストレージから復元）
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
  const [comparisonResultA, setComparisonResultA] = useState<FunnelAnalysisResult | null>(null);
  const [comparisonResultB, setComparisonResultB] = useState<FunnelAnalysisResult | null>(null);
  const [comparisonLoading, setComparisonLoading] = useState(false);
  const [comparisonError, setComparisonError] = useState<string | null>(null);

  // 期間比較の日付が変更されたらローカルストレージに保存
  useEffect(() => {
    saveComparisonDates({
      periodAStart,
      periodAEnd,
      periodBStart,
      periodBEnd,
    });
  }, [periodAStart, periodAEnd, periodBStart, periodBEnd]);

  // 初期選択: 最初のファネル
  useEffect(() => {
    if (!selectedFunnelId && funnels.length > 0) {
      setSelectedFunnelId(funnels[0].id);
    }
  }, [funnels, selectedFunnelId]);

  // 選択されたファネルの分析を実行
  useEffect(() => {
    if (!selectedFunnelId) {
      setAnalysisResult(null);
      return () => {};
    }

    let aborted = false;
    const controller = new AbortController();
    setAnalysisLoading(true);
    setAnalysisError(null);

    const selectedFunnel = funnels.find((f) => f.id === selectedFunnelId);

    if (!selectedFunnel) {
      setAnalysisLoading(false);
      return () => {};
    }

    fetch('/api/line/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        funnelDefinition: selectedFunnel,
        startDate,
        endDate,
      }),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to analyze funnel (${response.status})`);
        }
        return response.json() as Promise<FunnelAnalysisResult>;
      })
      .then((data) => {
        if (aborted) return;
        setAnalysisResult(data);
      })
      .catch((error) => {
        if (aborted || error.name === 'AbortError') return;
        setAnalysisError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!aborted) {
          setAnalysisLoading(false);
        }
      });

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [selectedFunnelId, funnels, startDate, endDate]);

  const selectedFunnel = useMemo(() => {
    if (!selectedFunnelId) return null;
    return funnels.find((f) => f.id === selectedFunnelId) ?? null;
  }, [selectedFunnelId, funnels]);

  // 期間比較分析を実行
  const runComparison = useCallback(async () => {
    if (!selectedFunnel) return;

    setComparisonLoading(true);
    setComparisonError(null);

    try {
      const [resA, resB] = await Promise.all([
        fetch('/api/line/funnel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            funnelDefinition: selectedFunnel,
            startDate: periodAStart,
            endDate: periodAEnd,
          }),
        }),
        fetch('/api/line/funnel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            funnelDefinition: selectedFunnel,
            startDate: periodBStart,
            endDate: periodBEnd,
          }),
        }),
      ]);

      if (!resA.ok || !resB.ok) {
        throw new Error('Failed to fetch comparison data');
      }

      const [dataA, dataB] = await Promise.all([
        resA.json() as Promise<FunnelAnalysisResult>,
        resB.json() as Promise<FunnelAnalysisResult>,
      ]);

      setComparisonResultA(dataA);
      setComparisonResultB(dataB);
    } catch (error) {
      setComparisonError(error instanceof Error ? error.message : String(error));
    } finally {
      setComparisonLoading(false);
    }
  }, [selectedFunnel, periodAStart, periodAEnd, periodBStart, periodBEnd]);

  const onCreate = () => {
    const defaultTagColumn = tagColumns[0]?.column ?? 'survey_completed';
    setEditingFunnel({
      name: '',
      description: '',
      steps: [
        { id: 'measure_target', label: '計測対象', tagColumn: 'friend_added_at' },
        { id: 'step_1', label: 'ステップ1', tagColumn: defaultTagColumn },
      ],
    });
  };

  const onEdit = (funnel: FunnelDefinition) => {
    setEditingFunnel({
      id: funnel.id,
      name: funnel.name,
      description: funnel.description,
      steps: funnel.steps.map(toStepForm),
    });
  };

  const onDuplicate = (funnel: FunnelDefinition) => {
    setEditingFunnel({
      // idを設定しないことで新規作成扱いになる
      name: `${funnel.name}（コピー）`,
      description: funnel.description,
      steps: funnel.steps.map(toStepForm),
    });
  };

  const resetEditingState = () => {
    setEditingFunnel(null);
    setIsSaving(false);
  };

  const handleDelete = async (funnelId: string) => {
    if (!window.confirm('このファネルを削除しますか？')) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/line/funnel/${funnelId}`, { method: 'DELETE' });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete');
      }
      await mutateFunnels();
      if (selectedFunnelId === funnelId) {
        setSelectedFunnelId(null);
      }
      if (editingFunnel?.id === funnelId) {
        resetEditingState();
      }
    } catch (error) {
      console.error('Failed to delete funnel', error);
      alert(error instanceof Error ? error.message : 'ファネルの削除に失敗しました');
    } finally {
      setDeleteBusy(false);
    }
  };

  const saveFunnel = async () => {
    if (!editingFunnel) return;
    if (!editingFunnel.name.trim()) {
      alert('ファネル名を入力してください');
      return;
    }
    if (editingFunnel.steps.length < 2) {
      alert('少なくとも2つのステップ（計測対象 + 1ステップ以上）を設定してください');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/line/funnel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingFunnel.id,
          name: editingFunnel.name.trim(),
          description: editingFunnel.description,
          steps: editingFunnel.steps.map((step) => ({
            id: step.id,
            label: step.label,
            tagColumn: step.tagColumn,
          })),
        }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const savedFunnel = await res.json();
      await mutateFunnels();
      if (savedFunnel?.id) {
        setSelectedFunnelId(savedFunnel.id);
      }
      resetEditingState();
    } catch (error) {
      console.error('Failed to save funnel', error);
      alert('ファネルの保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const addStep = (insertAtIndex?: number) => {
    if (!editingFunnel) return;
    const defaultTagColumn = tagColumns[0]?.column ?? 'survey_completed';
    const stepIndex = editingFunnel.steps.length;
    const newStep = { id: `step_${stepIndex}_${Date.now()}`, label: `ステップ${stepIndex}`, tagColumn: defaultTagColumn };

    if (insertAtIndex !== undefined && insertAtIndex >= 0) {
      const newSteps = [...editingFunnel.steps];
      newSteps.splice(insertAtIndex + 1, 0, newStep);
      setEditingFunnel({
        ...editingFunnel,
        steps: newSteps,
      });
    } else {
      setEditingFunnel({
        ...editingFunnel,
        steps: [...editingFunnel.steps, newStep],
      });
    }
  };

  const updateStep = (index: number, updates: Partial<FunnelStepForm>) => {
    if (!editingFunnel) return;
    setEditingFunnel({
      ...editingFunnel,
      steps: editingFunnel.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...updates } : step,
      ),
    });
  };

  const removeStep = (index: number) => {
    if (!editingFunnel) return;
    if (index === 0) return;
    if (editingFunnel.steps.length <= 2) {
      alert('最低2つのステップ（計測対象 + 1ステップ）が必要です');
      return;
    }
    setEditingFunnel({
      ...editingFunnel,
      steps: editingFunnel.steps.filter((_, idx) => idx !== index),
    });
  };

  const moveStep = (index: number, delta: number) => {
    if (!editingFunnel) return;
    if (index === 0) return;
    const nextIndex = index + delta;
    if (nextIndex < 1 || nextIndex >= editingFunnel.steps.length) return;
    const newSteps = [...editingFunnel.steps];
    const [target] = newSteps.splice(index, 1);
    newSteps.splice(nextIndex, 0, target);
    setEditingFunnel({
      ...editingFunnel,
      steps: newSteps,
    });
  };


  // 差分計算ヘルパー
  const getDiff = (a: number, b: number): { value: number; isPositive: boolean } => {
    const diff = b - a;
    return { value: diff, isPositive: diff >= 0 };
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
      <aside className="space-y-4">
        <Card className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[color:var(--color-text-primary)]">ファネル一覧</h2>
            <Button onClick={onCreate} disabled={!!editingFunnel}>
              新規作成
            </Button>
          </div>

          {/* ファネル一覧 */}
          <div className="space-y-1">
            {funnels.length === 0 ? (
              <p className="text-sm text-[color:var(--color-text-secondary)] px-3">
                ファネルがありません
              </p>
            ) : (
              funnels.map((funnel) => {
                const isActive = funnel.id === selectedFunnelId;
                return (
                  <button
                    key={funnel.id}
                    type="button"
                    onClick={() => {
                      setSelectedFunnelId(funnel.id);
                      setEditingFunnel(null);
                      setShowComparison(false);
                    }}
                    className={`w-full rounded-[var(--radius-sm)] px-3 py-2 text-left text-sm transition ${
                      isActive
                        ? 'bg-[color:var(--color-accent-muted)] text-[color:var(--color-accent-dark)]'
                        : 'bg-white text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-surface-muted)]'
                    }`}
                  >
                    <div className="font-medium">{funnel.name}</div>
                    {funnel.description ? (
                      <div className="text-xs text-[color:var(--color-text-secondary)]">{funnel.description}</div>
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {selectedFunnel ? (
          <Card className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)]">{selectedFunnel.name}</h3>
                {selectedFunnel.description ? (
                  <p className="text-xs text-[color:var(--color-text-secondary)]">{selectedFunnel.description}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => onEdit(selectedFunnel)} disabled={!!editingFunnel}>
                  編集
                </Button>
                <Button variant="secondary" onClick={() => onDuplicate(selectedFunnel)} disabled={!!editingFunnel}>
                  複製
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleDelete(selectedFunnel.id)}
                  disabled={deleteBusy}
                >
                  削除
                </Button>
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-[color:var(--color-text-secondary)]">ステップ</p>
              <ol className="mt-2 space-y-1 text-xs text-[color:var(--color-text-secondary)]">
                {selectedFunnel.steps.map((step, index) => (
                  <li key={step.id}>
                    {index}. {step.label}
                  </li>
                ))}
              </ol>
            </div>
          </Card>
        ) : null}
      </aside>

      <section className="space-y-6">
        {/* 分析結果表示 */}
        {selectedFunnel ? (
          <>
            <Card className="space-y-6 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">{selectedFunnel.name}</h2>
                  <p className="text-sm text-[color:var(--color-text-secondary)]">
                    {startDate} 〜 {endDate} の結果
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => setShowComparison(!showComparison)}
                >
                  {showComparison ? '期間比較を閉じる' : '期間比較'}
                </Button>
              </div>

              {analysisLoading ? (
                <p className="text-sm text-[color:var(--color-text-secondary)]">ファネル分析中...</p>
              ) : analysisError ? (
                <p className="text-sm text-[color:var(--color-danger)]">エラー: {analysisError}</p>
              ) : analysisResult ? (
                <>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4">
                      <p className="text-xs font-medium text-[color:var(--color-text-secondary)]">計測対象</p>
                      <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text-primary)]">
                        {formatNumber(analysisResult.totalBase)}人
                      </p>
                    </div>
                    {analysisResult.steps.length >= 2 ? (
                      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4">
                        <p className="text-xs font-medium text-[color:var(--color-text-secondary)]">
                          {analysisResult.steps[1]?.label ?? 'ステップ1'}
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text-primary)]">
                          {formatNumber(analysisResult.steps[1]?.reached ?? 0)}人
                        </p>
                        <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">
                          移行率 {formatPercent(analysisResult.steps[1]?.conversionRate ?? 0)}
                        </p>
                      </div>
                    ) : null}
                    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4">
                      <p className="text-xs font-medium text-[color:var(--color-text-secondary)]">
                        最終ステップ
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text-primary)]">
                        {formatNumber(analysisResult.steps[analysisResult.steps.length - 1]?.reached ?? 0)}人
                      </p>
                      <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">
                        全体比 {formatPercent(analysisResult.steps[analysisResult.steps.length - 1]?.overallRate ?? 0)}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px]">
                      <thead>
                        <tr className="border-b border-[color:var(--color-border)] bg-gray-50 text-left text-xs uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                          <th className="px-4 py-3">#</th>
                          <th className="px-4 py-3">ステップ</th>
                          <th className="px-4 py-3 text-right">到達人数</th>
                          <th className="px-4 py-3 text-right">未到達人数</th>
                          <th className="px-4 py-3 text-right">移行率</th>
                          <th className="px-4 py-3 text-right">全体比</th>
                          <th className="px-4 py-3">視覚化</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[color:var(--color-border)] text-sm">
                        {analysisResult.steps.map((step, index) => {
                          const isFirst = index === 0;
                          const conversionColor =
                            step.conversionRate >= 50
                              ? 'text-green-600'
                              : step.conversionRate >= 20
                                ? 'text-yellow-600'
                                : 'text-red-600';

                          return (
                            <tr key={step.stepId} className="hover:bg-[color:var(--color-surface-muted)]">
                              <td className="px-4 py-3 text-[color:var(--color-text-secondary)]">{index}</td>
                              <td className="px-4 py-3">
                                <div className="font-medium text-[color:var(--color-text-primary)]">{step.label}</div>
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-[color:var(--color-text-primary)]">
                                {formatNumber(step.reached)}
                              </td>
                              <td className="px-4 py-3 text-right text-[color:var(--color-text-secondary)]">
                                {isFirst ? '-' : formatNumber(step.notReached)}
                              </td>
                              <td className="px-4 py-3 text-right">
                                {isFirst ? (
                                  <span className="text-[color:var(--color-text-secondary)]">-</span>
                                ) : (
                                  <span className={conversionColor}>{formatPercent(step.conversionRate)}</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right text-[color:var(--color-text-secondary)]">
                                {formatPercent(step.overallRate)}
                              </td>
                              <td className="px-4 py-3">
                                <div className="h-6 w-full overflow-hidden rounded bg-gray-100">
                                  <div
                                    className="h-full bg-green-500 transition-all"
                                    style={{ width: `${step.overallRate}%` }}
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-sm text-[color:var(--color-text-secondary)]">ファネルを選択してください。</p>
              )}
            </Card>

            {/* 期間比較セクション */}
            {showComparison && (
              <Card className="space-y-6 p-6">
                <div>
                  <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">期間比較分析</h2>
                  <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                    2つの期間を比較して、ファネルの変化を分析します。
                  </p>
                </div>

                {/* 期間設定 */}
                <div className="grid gap-6 md:grid-cols-2">
                  {/* A期間 */}
                  <div className="space-y-3 p-4 rounded-[var(--radius-md)] bg-blue-50 border border-blue-200">
                    <h3 className="text-sm font-semibold text-blue-700">A期間（過去）</h3>
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
                    <h3 className="text-sm font-semibold text-green-700">B期間（最近）</h3>
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
                  <Button onClick={runComparison} disabled={comparisonLoading}>
                    {comparisonLoading ? '分析中...' : '比較分析を実行'}
                  </Button>
                </div>

                {/* 比較結果 */}
                {comparisonError && (
                  <p className="text-sm text-[color:var(--color-danger)]">エラー: {comparisonError}</p>
                )}

                {comparisonResultA && comparisonResultB && (
                  <div className="space-y-4">
                    {/* サマリー比較 */}
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="p-4 rounded-[var(--radius-md)] bg-blue-50 border border-blue-200">
                        <p className="text-xs font-medium text-blue-600 mb-2">A期間: {periodAStart} 〜 {periodAEnd}</p>
                        <p className="text-2xl font-bold text-blue-700">{formatNumber(comparisonResultA.totalBase)}人</p>
                        <p className="text-xs text-blue-600">計測対象</p>
                      </div>
                      <div className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200">
                        <p className="text-xs font-medium text-green-600 mb-2">B期間: {periodBStart} 〜 {periodBEnd}</p>
                        <p className="text-2xl font-bold text-green-700">{formatNumber(comparisonResultB.totalBase)}人</p>
                        <p className="text-xs text-green-600">計測対象</p>
                        {(() => {
                          const diff = getDiff(comparisonResultA.totalBase, comparisonResultB.totalBase);
                          return (
                            <p className={`text-xs mt-1 ${diff.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                              {diff.isPositive ? '+' : ''}{formatNumber(diff.value)} ({diff.isPositive ? '+' : ''}{formatPercent(comparisonResultA.totalBase > 0 ? (diff.value / comparisonResultA.totalBase) * 100 : 0)})
                            </p>
                          );
                        })()}
                      </div>
                    </div>

                    {/* 詳細比較テーブル */}
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[1000px]">
                        <thead>
                          <tr className="border-b border-[color:var(--color-border)] bg-gray-50">
                            <th className="px-3 py-3 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">#</th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">ステップ</th>
                            <th className="px-3 py-3 text-right text-xs font-medium text-blue-600 bg-blue-50" colSpan={3}>A期間</th>
                            <th className="w-6"></th>
                            <th className="px-3 py-3 text-left text-xs font-medium text-green-600 bg-green-50" colSpan={3}>B期間</th>
                            <th className="px-3 py-3 text-center text-xs font-medium text-[color:var(--color-text-secondary)]" colSpan={2}>差分</th>
                          </tr>
                          <tr className="border-b border-[color:var(--color-border)] bg-gray-50 text-xs">
                            <th className="px-3 py-2"></th>
                            <th className="px-3 py-2"></th>
                            <th className="px-3 py-2 text-right text-blue-600 bg-blue-50">到達数</th>
                            <th className="px-3 py-2 text-right text-blue-600 bg-blue-50">移行率</th>
                            <th className="px-3 py-2 text-right text-blue-600 bg-blue-50">全体比</th>
                            <th className="w-6"></th>
                            <th className="px-3 py-2 text-right text-green-600 bg-green-50">到達数</th>
                            <th className="px-3 py-2 text-right text-green-600 bg-green-50">移行率</th>
                            <th className="px-3 py-2 text-right text-green-600 bg-green-50">全体比</th>
                            <th className="px-3 py-2 text-right">移行率差</th>
                            <th className="px-3 py-2 text-right">全体比差</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[color:var(--color-border)] text-sm">
                          {comparisonResultA.steps.map((stepA, index) => {
                            const stepB = comparisonResultB.steps[index];
                            if (!stepB) return null;
                            const isFirst = index === 0;
                            const rateDiff = getDiff(stepA.conversionRate, stepB.conversionRate);
                            const overallDiff = getDiff(stepA.overallRate, stepB.overallRate);

                            return (
                              <tr key={stepA.stepId} className="hover:bg-[color:var(--color-surface-muted)]">
                                <td className="px-3 py-3 text-[color:var(--color-text-secondary)]">{index}</td>
                                <td className="px-3 py-3 font-medium text-[color:var(--color-text-primary)]">
                                  {stepA.label}
                                </td>
                                <td className="px-3 py-3 text-right bg-blue-50/50">{formatNumber(stepA.reached)}</td>
                                <td className="px-3 py-3 text-right bg-blue-50/50">
                                  {isFirst ? '-' : formatPercent(stepA.conversionRate)}
                                </td>
                                <td className="px-3 py-3 text-right bg-blue-50/50">
                                  {formatPercent(stepA.overallRate)}
                                </td>
                                <td className="w-6"></td>
                                <td className="px-3 py-3 text-right bg-green-50/50">{formatNumber(stepB.reached)}</td>
                                <td className="px-3 py-3 text-right bg-green-50/50">
                                  {isFirst ? '-' : formatPercent(stepB.conversionRate)}
                                </td>
                                <td className="px-3 py-3 text-right bg-green-50/50">
                                  {formatPercent(stepB.overallRate)}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  {isFirst ? (
                                    '-'
                                  ) : (
                                    <span className={rateDiff.isPositive ? 'text-green-600' : 'text-red-600'}>
                                      {rateDiff.isPositive ? '+' : ''}{formatPercent(rateDiff.value)}
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-3 text-right">
                                  {isFirst ? (
                                    '-'
                                  ) : (
                                    <span className={overallDiff.isPositive ? 'text-green-600' : 'text-red-600'}>
                                      {overallDiff.isPositive ? '+' : ''}{formatPercent(overallDiff.value)}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* 全体比の視覚的な比較（左右分割） */}
                    <div>
                      <h4 className="text-sm font-semibold text-[color:var(--color-text-primary)] mb-4">全体比の比較</h4>
                      <div className="grid gap-6 md:grid-cols-2">
                        {/* A期間 */}
                        <div className="p-4 rounded-[var(--radius-md)] bg-blue-50 border border-blue-200">
                          <h5 className="text-sm font-semibold text-blue-700 mb-3">A期間</h5>
                          <div className="space-y-3">
                            {comparisonResultA.steps.map((step, index) => (
                              <div key={step.stepId} className="space-y-1">
                                <div className="flex justify-between text-xs">
                                  <span className="text-blue-700">{index}. {step.label}</span>
                                  <span className="font-semibold text-blue-800">{formatPercent(step.overallRate)}</span>
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
                          <h5 className="text-sm font-semibold text-green-700 mb-3">B期間</h5>
                          <div className="space-y-3">
                            {comparisonResultB.steps.map((step, index) => {
                              const stepA = comparisonResultA.steps[index];
                              const diff = stepA ? getDiff(stepA.overallRate, step.overallRate) : null;
                              return (
                                <div key={step.stepId} className="space-y-1">
                                  <div className="flex justify-between text-xs">
                                    <span className="text-green-700">{index}. {step.label}</span>
                                    <span className="font-semibold text-green-800">
                                      {formatPercent(step.overallRate)}
                                      {diff && index > 0 && (
                                        <span className={`ml-2 ${diff.isPositive ? 'text-green-600' : 'text-red-500'}`}>
                                          ({diff.isPositive ? '+' : ''}{formatPercent(diff.value)})
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
            )}
          </>
        ) : !editingFunnel ? (
          <Card className="p-6 text-sm text-[color:var(--color-text-secondary)]">
            ファネルを選択すると分析結果が表示されます。
          </Card>
        ) : null}

        {/* ファネル編集フォーム */}
        {editingFunnel ? (
          <Card className="space-y-6 p-6">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
                {editingFunnel.id ? 'ファネルを編集' : 'ファネルを作成'}
              </h2>
              <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                LSTEPのタグを使ってファネルを定義し、各ステップの到達率を分析します。
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-[color:var(--color-text-primary)]">ファネル名</span>
                <input
                  type="text"
                  value={editingFunnel.name}
                  onChange={(event) =>
                    setEditingFunnel({ ...editingFunnel, name: event.target.value })
                  }
                  className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                  placeholder="例: コンサル申込ファネル"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium text-[color:var(--color-text-primary)]">説明（任意）</span>
                <input
                  type="text"
                  value={editingFunnel.description ?? ''}
                  onChange={(event) =>
                    setEditingFunnel({ ...editingFunnel, description: event.target.value })
                  }
                  className="w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                  placeholder="このファネルの目的をメモできます"
                />
              </label>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)]">
                  ステップ定義 ({editingFunnel.steps.length}件)
                </h3>
                <Button variant="secondary" onClick={() => addStep()}>
                  + 末尾に追加
                </Button>
              </div>

              <div className="space-y-2">
                {editingFunnel.steps.map((step, index) => {
                  const isFirstStep = index === 0;
                  return (
                    <div key={`${step.id}-${index}`} className="group">
                      <Card className="p-4 border-l-4 border-l-[color:var(--color-accent)]">
                        <div className="flex items-start gap-4">
                          {/* ステップ番号とドラッグハンドル */}
                          <div className="flex flex-col items-center gap-1 pt-1">
                            <span className="text-xs font-bold text-[color:var(--color-accent)] bg-[color:var(--color-accent-muted)] rounded-full w-6 h-6 flex items-center justify-center">
                              {index}
                            </span>
                            {!isFirstStep && (
                              <div className="flex flex-col gap-0.5">
                                <button
                                  type="button"
                                  onClick={() => moveStep(index, -1)}
                                  disabled={index <= 1}
                                  className="text-xs text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)] disabled:opacity-30"
                                  title="上に移動"
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveStep(index, 1)}
                                  disabled={index === editingFunnel.steps.length - 1}
                                  className="text-xs text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-primary)] disabled:opacity-30"
                                  title="下に移動"
                                >
                                  ▼
                                </button>
                              </div>
                            )}
                          </div>

                          {/* メインコンテンツ */}
                          <div className="flex-1 grid gap-3 md:grid-cols-2">
                            <label className="flex flex-col gap-1">
                              <span className="text-xs font-medium text-[color:var(--color-text-secondary)]">
                                表示名 {isFirstStep && '(固定)'}
                              </span>
                              <input
                                type="text"
                                value={step.label}
                                onChange={(event) => updateStep(index, { label: event.target.value })}
                                className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)] disabled:bg-gray-50 disabled:text-[color:var(--color-text-secondary)]"
                                disabled={isFirstStep}
                                placeholder="例: アンケート完了"
                              />
                            </label>

                            <label className="flex flex-col gap-1">
                              <span className="text-xs font-medium text-[color:var(--color-text-secondary)]">
                                タグカラム {isFirstStep && '(固定)'}
                              </span>
                              {isFirstStep ? (
                                <input
                                  type="text"
                                  value="friend_added_at"
                                  disabled
                                  className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-gray-50 px-3 py-2 text-sm text-[color:var(--color-text-secondary)]"
                                />
                              ) : (
                                <select
                                  value={step.tagColumn}
                                  onChange={(event) => updateStep(index, { tagColumn: event.target.value })}
                                  className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                                >
                                  {tagColumns.map((column) => (
                                    <option key={column.column} value={column.column}>
                                      {column.label}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </label>
                          </div>

                          {/* 削除ボタン */}
                          {!isFirstStep && (
                            <button
                              type="button"
                              onClick={() => removeStep(index)}
                              className="p-2 text-[color:var(--color-text-muted)] hover:text-red-500 hover:bg-red-50 rounded transition"
                              title="このステップを削除"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </Card>

                      {/* ステップ間に挿入ボタン */}
                      {index < editingFunnel.steps.length - 1 && (
                        <div className="flex justify-center py-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() => addStep(index)}
                            className="text-xs text-[color:var(--color-accent)] hover:text-[color:var(--color-accent-dark)] flex items-center gap-1 px-2 py-1 rounded hover:bg-[color:var(--color-accent-muted)]"
                          >
                            <span>+</span>
                            <span>ここに挿入</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-[color:var(--color-border)]">
              <Button variant="secondary" onClick={resetEditingState} disabled={isSaving}>
                キャンセル
              </Button>
              <Button onClick={saveFunnel} disabled={isSaving}>
                {isSaving ? '保存中…' : '保存'}
              </Button>
            </div>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
