'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type {
  LinkFunnel,
  LinkFunnelMetrics,
  LinkFunnelStep,
  LinkFunnelStepType,
} from '@/lib/links/types';
import type { ShortLink } from '@/lib/links/types';

const fetcher = async (input: RequestInfo) => {
  const res = await fetch(input.toString());
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
};

interface FunnelStepForm {
  stepId?: string;
  label: string;
  type: LinkFunnelStepType;
  shortLinkId?: string;
  lineSource?: string;
  lineTag?: string;
}

interface FunnelFormState {
  id?: string;
  name: string;
  description?: string;
  steps: FunnelStepForm[];
}

interface LinkFunnelsManagerProps {
  startDate: string;
  endDate: string;
}

interface LineOptionsResponse {
  lineSources: string[];
  lineTags: Array<{ name: string; description: string | null }>;
}

function toStepForm(step: LinkFunnelStep): FunnelStepForm {
  return {
    stepId: step.stepId,
    label: step.label,
    type: step.type,
    shortLinkId: step.shortLinkId,
    lineSource: step.lineSource,
    lineTag: step.lineTag,
  };
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(1)}%`;
}

export function LinkFunnelsManager({ startDate, endDate }: LinkFunnelsManagerProps) {
  const { data: funnelData, mutate: mutateFunnels } = useSWR<{ funnels: LinkFunnel[] }>(
    '/api/links/funnels',
    fetcher,
  );

  const { data: shortLinksData } = useSWR<ShortLink[]>('/api/links/list', fetcher);
  const { data: lineOptions } = useSWR<LineOptionsResponse>('/api/links/funnels/options', fetcher);

  const funnels = useMemo(() => funnelData?.funnels ?? [], [funnelData]);
  const shortLinks = shortLinksData ?? [];
  const lineSources = lineOptions?.lineSources ?? [];
  const lineTags = lineOptions?.lineTags ?? [];

  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [editingFunnel, setEditingFunnel] = useState<FunnelFormState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!selectedFunnelId && funnels.length > 0) {
      setSelectedFunnelId(funnels[0].id);
    }
  }, [funnels, selectedFunnelId]);

  useEffect(() => {
    if (editingFunnel?.id) {
      setSelectedFunnelId(editingFunnel.id);
    }
  }, [editingFunnel]);

  const { data: metricsData, mutate: mutateMetrics } = useSWR<{ metrics: LinkFunnelMetrics } | null>(
    selectedFunnelId
      ? `/api/links/funnels/${selectedFunnelId}/metrics?start=${startDate}&end=${endDate}`
      : null,
    fetcher,
  );

  const selectedFunnel = useMemo(
    () => funnels.find((item) => item.id === selectedFunnelId) ?? null,
    [funnels, selectedFunnelId],
  );

  const onCreate = () => {
    setEditingFunnel({
      name: '',
      description: '',
      steps: shortLinks.length
        ? [
            {
              label: shortLinks[0].managementName || shortLinks[0].shortCode,
              type: 'short_link',
              shortLinkId: shortLinks[0].id,
            },
            {
              label: 'LINE登録',
              type: 'line_registration',
            },
          ]
        : [
            {
              label: 'ステップ1',
              type: 'short_link',
            },
          ],
    });
  };

  const onEdit = (funnel: LinkFunnel) => {
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
      const res = await fetch(`/api/links/funnels/${funnelId}`, { method: 'DELETE' });
      if (!res.ok) {
        throw new Error(await res.text());
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
      alert('ファネルの削除に失敗しました');
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
    if (!editingFunnel.steps.length) {
      alert('少なくとも1つのステップを設定してください');
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch('/api/links/funnels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingFunnel.id,
          name: editingFunnel.name.trim(),
          description: editingFunnel.description,
          steps: editingFunnel.steps,
        }),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = await res.json();
      await mutateFunnels();
      if (data?.funnel?.id) {
        setSelectedFunnelId(data.funnel.id);
        mutateMetrics();
      }
      resetEditingState();
    } catch (error) {
      console.error('Failed to save funnel', error);
      alert('ファネルの保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const addStep = (type: LinkFunnelStepType) => {
    if (!editingFunnel) return;
    const draft: FunnelStepForm = {
      label: type === 'line_registration' ? 'LINE登録' : 'ステップ',
      type,
    };
    if (type === 'short_link' && shortLinks[0]) {
      draft.shortLinkId = shortLinks[0].id;
      draft.label = shortLinks[0].managementName || shortLinks[0].shortCode || '短縮リンク';
    }
    setEditingFunnel({
      ...editingFunnel,
      steps: [...editingFunnel.steps, draft],
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
    setEditingFunnel({
      ...editingFunnel,
      steps: editingFunnel.steps.filter((_, idx) => idx !== index),
    });
  };

  const moveStep = (index: number, delta: number) => {
    if (!editingFunnel) return;
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= editingFunnel.steps.length) return;
    const newSteps = [...editingFunnel.steps];
    const [target] = newSteps.splice(index, 1);
    newSteps.splice(nextIndex, 0, target);
    setEditingFunnel({
      ...editingFunnel,
      steps: newSteps,
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
      <aside className="space-y-4">
        <Card className="space-y-4 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-[color:var(--color-text-primary)]">ファネル一覧</h2>
            <Button size="sm" onClick={onCreate} disabled={!!editingFunnel}>
              新規作成
            </Button>
          </div>
          <div className="space-y-1">
            {funnels.length === 0 ? (
              <p className="text-sm text-[color:var(--color-text-secondary)]">まだファネルがありません。</p>
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
                <Button size="sm" variant="secondary" onClick={() => onEdit(selectedFunnel)} disabled={!!editingFunnel}>
                  編集
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
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
                  <li key={step.stepId}>
                    {index + 1}. {step.label} ({step.type === 'short_link' ? 'リンク' : 'LINE登録'})
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
                リンククリックからLINE登録までのステップを定義し、遷移率を可視化します。
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
                  placeholder="例: LP → CTA → LINE登録"
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
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => addStep('short_link')}>
                    ステップを追加（リンク）
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => addStep('line_registration')}>
                    LINE登録ステップを追加
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {editingFunnel.steps.map((step, index) => (
                  <Card key={index} className="space-y-3 p-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-[color:var(--color-text-primary)]">
                        ステップ {index + 1}
                      </h4>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => moveStep(index, -1)} disabled={index === 0}>
                          ↑
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => moveStep(index, 1)}
                          disabled={index === editingFunnel.steps.length - 1}
                        >
                          ↓
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeStep(index)}
                          disabled={editingFunnel.steps.length === 1}
                        >
                          削除
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="flex flex-col gap-2">
                        <span className="text-xs font-medium text-[color:var(--color-text-secondary)]">表示名</span>
                        <input
                          type="text"
                          value={step.label}
                          onChange={(event) => updateStep(index, { label: event.target.value })}
                          className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                        />
                      </label>

                      <label className="flex flex-col gap-2">
                        <span className="text-xs font-medium text-[color:var(--color-text-secondary)]">ステップ種別</span>
                        <select
                          value={step.type}
                          onChange={(event) => {
                            const nextType = event.target.value as LinkFunnelStepType;
                            const updates: Partial<FunnelStepForm> = { type: nextType };
                            if (nextType === 'short_link' && !step.shortLinkId && shortLinks[0]) {
                              updates.shortLinkId = shortLinks[0].id;
                            }
                            updateStep(index, updates);
                          }}
                          className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                        >
                          <option value="short_link">リンククリック</option>
                          <option value="line_registration">LINE登録</option>
                        </select>
                      </label>
                    </div>

                    {step.type === 'short_link' ? (
                      <label className="flex flex-col gap-2">
                        <span className="text-xs font-medium text-[color:var(--color-text-secondary)]">短縮リンク</span>
                        <select
                          value={step.shortLinkId ?? ''}
                          onChange={(event) =>
                            updateStep(index, { shortLinkId: event.target.value || undefined })
                          }
                          className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                        >
                          <option value="">選択してください</option>
                          {shortLinks.map((link) => (
                            <option key={link.id} value={link.id}>
                              {link.managementName || link.shortCode} | {link.destinationUrl}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        <label className="flex flex-col gap-2">
                          <span className="text-xs font-medium text-[color:var(--color-text-secondary)]">LINEソース（任意）</span>
                          <select
                            value={step.lineSource ?? ''}
                            onChange={(event) =>
                              updateStep(index, { lineSource: event.target.value || undefined })
                            }
                            className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                          >
                            <option value="">指定しない</option>
                            {lineSources.map((source) => (
                              <option key={source} value={source}>
                                {source}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="text-xs font-medium text-[color:var(--color-text-secondary)]">LINEタグ（任意）</span>
                          <select
                            value={step.lineTag ?? ''}
                            onChange={(event) =>
                              updateStep(index, { lineTag: event.target.value || undefined })
                            }
                            className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                          >
                            <option value="">指定しない</option>
                            {lineTags.map((tag) => (
                              <option key={tag.name} value={tag.name}>
                                {tag.name}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <Button variant="ghost" onClick={resetEditingState} disabled={isSaving}>
                キャンセル
              </Button>
              <Button onClick={saveFunnel} disabled={isSaving}>
                {isSaving ? '保存中…' : '保存'}
              </Button>
            </div>
          </Card>
        ) : null}

        {selectedFunnel && metricsData ? (
          <Card className="space-y-6 p-6">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">{selectedFunnel.name}</h2>
              <p className="text-sm text-[color:var(--color-text-secondary)]">
                {startDate} 〜 {endDate} の結果
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4">
                <p className="text-xs font-medium text-[color:var(--color-text-secondary)]">ステップ1</p>
                <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text-primary)]">
                  {metricsData.metrics.steps[0]?.count?.toLocaleString() ?? 0}
                </p>
                <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">
                  {formatPercent(metricsData.metrics.steps[0]?.conversionRate ?? 100)}
                </p>
              </div>
              {metricsData.metrics.steps.length >= 3 ? (
                <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4">
                  <p className="text-xs font-medium text-[color:var(--color-text-secondary)]">ステップ2</p>
                  <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text-primary)]">
                    {metricsData.metrics.steps[1]?.count?.toLocaleString() ?? 0}
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">
                    {formatPercent(metricsData.metrics.steps[1]?.conversionRate ?? 0)}
                  </p>
                </div>
              ) : (
                <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4">
                  <p className="text-xs font-medium text-[color:var(--color-text-secondary)]">ステップ2</p>
                  <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text-secondary)]">
                    -
                  </p>
                </div>
              )}
              <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4">
                <p className="text-xs font-medium text-[color:var(--color-text-secondary)]">最終ステップ</p>
                <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text-primary)]">
                  {metricsData.metrics.steps[metricsData.metrics.steps.length - 1]?.count?.toLocaleString() ?? 0}
                </p>
                <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">
                  {formatPercent(metricsData.metrics.steps[metricsData.metrics.steps.length - 1]?.cumulativeRate ?? 0)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] bg-gray-50 text-left text-xs uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                    <th className="px-4 py-3">ステップ</th>
                    <th className="px-4 py-3">種類</th>
                    <th className="px-4 py-3 text-right">件数</th>
                    <th className="px-4 py-3 text-right">前ステップ比</th>
                    <th className="px-4 py-3 text-right">初期ステップ比</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--color-border)] text-sm">
                  {metricsData.metrics.steps.map((step, index) => (
                    <tr key={step.stepId} className="hover:bg-[color:var(--color-surface-muted)]">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[color:var(--color-text-primary)]">{index + 1}. {step.label}</div>
                      </td>
                      <td className="px-4 py-3 text-[color:var(--color-text-secondary)]">
                        {step.type === 'short_link' ? 'リンククリック' : 'LINE登録'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[color:var(--color-text-primary)]">
                        {step.count.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-[color:var(--color-text-secondary)]">
                        {formatPercent(step.conversionRate)}
                      </td>
                      <td className="px-4 py-3 text-right text-[color:var(--color-text-secondary)]">
                        {formatPercent(step.cumulativeRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : selectedFunnel ? (
          <Card className="p-6 text-sm text-[color:var(--color-text-secondary)]">ファネル指標を読み込み中...</Card>
        ) : (
          <Card className="p-6 text-sm text-[color:var(--color-text-secondary)]">
            ファネルを選択すると指標が表示されます。
          </Card>
        )}
      </section>
    </div>
  );
}
