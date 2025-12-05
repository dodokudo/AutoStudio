'use client';

import { useEffect, useMemo, useState } from 'react';
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
  presets: FunnelDefinition[];
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

export function LineFunnelsManager({ startDate, endDate }: LineFunnelsManagerProps) {
  const { data: funnelListData, mutate: mutateFunnels } = useSWR<FunnelListResponse>(
    '/api/line/funnel',
    fetcher,
  );

  const { data: tagColumnsData } = useSWR<TagColumnsResponse>(
    '/api/line/funnel/options',
    fetcher,
  );

  const presets = useMemo(() => funnelListData?.presets ?? [], [funnelListData]);
  const customFunnels = useMemo(() => funnelListData?.custom ?? [], [funnelListData]);
  const tagColumns = useMemo(() => tagColumnsData?.columns ?? [], [tagColumnsData]);

  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [selectedFunnelType, setSelectedFunnelType] = useState<'preset' | 'custom'>('preset');
  const [editingFunnel, setEditingFunnel] = useState<FunnelFormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<FunnelAnalysisResult | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // 初期選択: プリセットの最初のファネル
  useEffect(() => {
    if (!selectedFunnelId && presets.length > 0) {
      setSelectedFunnelId(presets[0].id);
      setSelectedFunnelType('preset');
    }
  }, [presets, selectedFunnelId]);

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

    const selectedFunnel =
      selectedFunnelType === 'preset'
        ? presets.find((f) => f.id === selectedFunnelId)
        : customFunnels.find((f) => f.id === selectedFunnelId);

    if (!selectedFunnel) {
      setAnalysisLoading(false);
      return () => {};
    }

    fetch('/api/line/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        preset: selectedFunnelType === 'preset' ? selectedFunnelId : undefined,
        funnelDefinition: selectedFunnelType === 'custom' ? selectedFunnel : undefined,
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
  }, [selectedFunnelId, selectedFunnelType, presets, customFunnels, startDate, endDate]);

  const selectedFunnel = useMemo(() => {
    if (!selectedFunnelId) return null;
    if (selectedFunnelType === 'preset') {
      return presets.find((f) => f.id === selectedFunnelId) ?? null;
    }
    return customFunnels.find((f) => f.id === selectedFunnelId) ?? null;
  }, [selectedFunnelId, selectedFunnelType, presets, customFunnels]);

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
        setSelectedFunnelId(presets[0]?.id ?? null);
        setSelectedFunnelType('preset');
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
        setSelectedFunnelType('custom');
      }
      resetEditingState();
    } catch (error) {
      console.error('Failed to save funnel', error);
      alert('ファネルの保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const addStep = () => {
    if (!editingFunnel) return;
    const defaultTagColumn = tagColumns[0]?.column ?? 'survey_completed';
    const stepIndex = editingFunnel.steps.length;
    setEditingFunnel({
      ...editingFunnel,
      steps: [
        ...editingFunnel.steps,
        { id: `step_${stepIndex}`, label: `ステップ${stepIndex}`, tagColumn: defaultTagColumn },
      ],
    });
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
    // 最初のステップ（計測対象）は削除不可
    if (index === 0) return;
    setEditingFunnel({
      ...editingFunnel,
      steps: editingFunnel.steps.filter((_, idx) => idx !== index),
    });
  };

  const moveStep = (index: number, delta: number) => {
    if (!editingFunnel) return;
    // 最初のステップ（計測対象）は移動不可
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

  const isPreset = selectedFunnelType === 'preset';

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

          {/* プリセットファネル */}
          <div>
            <p className="text-xs font-medium text-[color:var(--color-text-muted)] mb-2">プリセット</p>
            <div className="space-y-1">
              {presets.map((funnel) => {
                const isActive = funnel.id === selectedFunnelId && selectedFunnelType === 'preset';
                return (
                  <button
                    key={funnel.id}
                    type="button"
                    onClick={() => {
                      setSelectedFunnelId(funnel.id);
                      setSelectedFunnelType('preset');
                      setEditingFunnel(null);
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
              })}
            </div>
          </div>

          {/* カスタムファネル */}
          <div>
            <p className="text-xs font-medium text-[color:var(--color-text-muted)] mb-2">カスタム</p>
            <div className="space-y-1">
              {customFunnels.length === 0 ? (
                <p className="text-sm text-[color:var(--color-text-secondary)] px-3">
                  カスタムファネルはありません
                </p>
              ) : (
                customFunnels.map((funnel) => {
                  const isActive = funnel.id === selectedFunnelId && selectedFunnelType === 'custom';
                  return (
                    <button
                      key={funnel.id}
                      type="button"
                      onClick={() => {
                        setSelectedFunnelId(funnel.id);
                        setSelectedFunnelType('custom');
                        setEditingFunnel(null);
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
              {!isPreset ? (
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => onEdit(selectedFunnel)} disabled={!!editingFunnel}>
                    編集
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleDelete(selectedFunnel.id)}
                    disabled={deleteBusy}
                  >
                    削除
                  </Button>
                </div>
              ) : (
                <span className="text-xs text-[color:var(--color-text-muted)]">プリセット</span>
              )}
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
                <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)]">ステップ定義</h3>
                <Button variant="secondary" onClick={addStep}>
                  ステップを追加
                </Button>
              </div>

              <div className="space-y-3">
                {editingFunnel.steps.map((step, index) => {
                  const isFirstStep = index === 0;
                  return (
                    <Card key={index} className="space-y-3 p-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-[color:var(--color-text-primary)]">
                          ステップ {index} {isFirstStep ? '（計測対象）' : ''}
                        </h4>
                        {!isFirstStep ? (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="secondary"
                              onClick={() => moveStep(index, -1)}
                              disabled={index <= 1}
                            >
                              ↑
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => moveStep(index, 1)}
                              disabled={index === editingFunnel.steps.length - 1}
                            >
                              ↓
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => removeStep(index)}
                            >
                              削除
                            </Button>
                          </div>
                        ) : null}
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="flex flex-col gap-2">
                          <span className="text-xs font-medium text-[color:var(--color-text-secondary)]">表示名</span>
                          <input
                            type="text"
                            value={step.label}
                            onChange={(event) => updateStep(index, { label: event.target.value })}
                            className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                            disabled={isFirstStep}
                          />
                        </label>

                        <label className="flex flex-col gap-2">
                          <span className="text-xs font-medium text-[color:var(--color-text-secondary)]">
                            タグカラム
                          </span>
                          {isFirstStep ? (
                            <input
                              type="text"
                              value="friend_added_at（固定）"
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
                    </Card>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button variant="secondary" onClick={resetEditingState} disabled={isSaving}>
                キャンセル
              </Button>
              <Button onClick={saveFunnel} disabled={isSaving}>
                {isSaving ? '保存中…' : '保存'}
              </Button>
            </div>
          </Card>
        ) : null}

        {/* 分析結果表示 */}
        {selectedFunnel && !editingFunnel ? (
          <Card className="space-y-6 p-6">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">{selectedFunnel.name}</h2>
              <p className="text-sm text-[color:var(--color-text-secondary)]">
                {startDate} 〜 {endDate} の結果
              </p>
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
        ) : !editingFunnel ? (
          <Card className="p-6 text-sm text-[color:var(--color-text-secondary)]">
            ファネルを選択すると分析結果が表示されます。
          </Card>
        ) : null}
      </section>
    </div>
  );
}
