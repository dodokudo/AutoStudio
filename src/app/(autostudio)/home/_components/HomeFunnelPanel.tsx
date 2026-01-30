'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import type { FunnelAnalysisResult, FunnelDefinition, FunnelStepResult } from '@/lib/lstep/funnel';

interface HomeFunnelPanelProps {
  startDate: string;
  endDate: string;
}

interface FunnelListResponse {
  custom: FunnelDefinition[];
}

interface FunnelSettingsResponse {
  success: boolean;
  data: {
    selectedFunnelId: string | null;
    hiddenStepsByFunnel: Record<string, string[]>;
  };
}

interface PurchaseCountsResponse {
  frontend: number;
  backend: number;
}

const numberFormatter = new Intl.NumberFormat('ja-JP');
const percentFormatter = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}

function formatPercent(value: number): string {
  return `${percentFormatter.format(value)}%`;
}

function recalcSteps(steps: FunnelStepResult[], totalBase: number): FunnelStepResult[] {
  let previousReached = totalBase;
  return steps.map((step) => {
    const reached = step.reached;
    const notReached = previousReached - reached;
    const conversionRate = previousReached > 0 ? (reached / previousReached) * 100 : 0;
    const overallRate = totalBase > 0 ? (reached / totalBase) * 100 : 0;
    previousReached = reached;
    return {
      ...step,
      notReached,
      conversionRate,
      overallRate,
    };
  });
}

export function HomeFunnelPanel({ startDate, endDate }: HomeFunnelPanelProps) {
  const [funnels, setFunnels] = useState<FunnelDefinition[]>([]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string | null>(null);
  const [hiddenStepsByFunnel, setHiddenStepsByFunnel] = useState<Record<string, string[]>>({});
  const [analysisResult, setAnalysisResult] = useState<FunnelAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [purchaseCounts, setPurchaseCounts] = useState<PurchaseCountsResponse | null>(null);

  useEffect(() => {
    let canceled = false;
    const controller = new AbortController();

    const load = async () => {
      try {
        const [funnelsRes, settingsRes] = await Promise.all([
          fetch('/api/line/funnel', { signal: controller.signal }),
          fetch('/api/home/funnel-settings', { signal: controller.signal }),
        ]);

        if (!funnelsRes.ok || !settingsRes.ok) {
          throw new Error('Failed to load funnel data');
        }

        const funnelData = await funnelsRes.json() as FunnelListResponse;
        const settingsData = await settingsRes.json() as FunnelSettingsResponse;

        if (canceled) return;

        const customFunnels = funnelData.custom ?? [];
        setFunnels(customFunnels);

        const savedSelected = settingsData.data?.selectedFunnelId ?? null;
        const nextSelected = savedSelected ?? customFunnels[0]?.id ?? null;
        setSelectedFunnelId(nextSelected);
        setHiddenStepsByFunnel(settingsData.data?.hiddenStepsByFunnel ?? {});
      } catch (err) {
        if (canceled) return;
        setError(err instanceof Error ? err.message : 'Failed to load funnels');
      }
    };

    load();
    return () => {
      canceled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!selectedFunnelId) {
      setAnalysisResult(null);
      return;
    }

    let canceled = false;
    const controller = new AbortController();
    const selected = funnels.find((funnel) => funnel.id === selectedFunnelId);

    if (!selected) {
      setAnalysisResult(null);
      return;
    }

    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const [analysisRes, purchaseRes] = await Promise.all([
          fetch('/api/line/funnel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              funnelDefinition: selected,
              startDate,
              endDate,
            }),
            signal: controller.signal,
          }),
          fetch(`/api/home/purchase-counts?start=${startDate}&end=${endDate}`, { signal: controller.signal }),
        ]);

        if (!analysisRes.ok) throw new Error(await analysisRes.text());
        if (!purchaseRes.ok) throw new Error(await purchaseRes.text());

        const result = await analysisRes.json() as FunnelAnalysisResult;
        const purchaseData = await purchaseRes.json() as PurchaseCountsResponse;

        if (canceled) return;
        setAnalysisResult(result);
        setPurchaseCounts({ frontend: purchaseData.frontend ?? 0, backend: purchaseData.backend ?? 0 });
      } catch (err) {
        if (canceled) return;
        setError(err instanceof Error ? err.message : 'Failed to analyze funnel');
        setAnalysisResult(null);
      } finally {
        if (!canceled) setLoading(false);
      }
    };

    load();
    return () => {
      canceled = true;
      controller.abort();
    };
  }, [selectedFunnelId, startDate, endDate, funnels]);

  const selectedFunnel = useMemo(
    () => funnels.find((funnel) => funnel.id === selectedFunnelId) ?? null,
    [funnels, selectedFunnelId],
  );

  const hiddenSet = useMemo(() => {
    if (!selectedFunnelId) return new Set<string>();
    return new Set(hiddenStepsByFunnel[selectedFunnelId] ?? []);
  }, [hiddenStepsByFunnel, selectedFunnelId]);

  const visibleSteps = useMemo(() => {
    if (!analysisResult) return [];
    return analysisResult.steps.filter((step) => !hiddenSet.has(step.stepId));
  }, [analysisResult, hiddenSet]);

  const displaySteps = useMemo(() => {
    if (!analysisResult) return [];
    const steps = [...visibleSteps];
    if (purchaseCounts) {
      steps.push({
        stepId: 'frontend_purchase',
        label: 'フロント購入',
        reached: purchaseCounts.frontend ?? 0,
        notReached: 0,
        conversionRate: 0,
        overallRate: 0,
      });
      steps.push({
        stepId: 'backend_purchase',
        label: 'バック購入',
        reached: purchaseCounts.backend ?? 0,
        notReached: 0,
        conversionRate: 0,
        overallRate: 0,
      });
    }
    return recalcSteps(steps, analysisResult.totalBase);
  }, [analysisResult, visibleSteps, purchaseCounts]);

  const getStepUnit = (stepId: string) => {
    return stepId === 'frontend_purchase' || stepId === 'backend_purchase' ? '件' : '人';
  };

  const handleSelect = async (nextId: string) => {
    setSelectedFunnelId(nextId);
    const updated = {
      selectedFunnelId: nextId,
      hiddenStepsByFunnel,
    };
    await fetch('/api/home/funnel-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
  };

  const handleToggleStep = async (stepId: string) => {
    if (!selectedFunnelId) return;
    const nextHidden = new Set(hiddenSet);
    if (nextHidden.has(stepId)) {
      nextHidden.delete(stepId);
    } else {
      nextHidden.add(stepId);
    }
    const updatedMap = {
      ...hiddenStepsByFunnel,
      [selectedFunnelId]: Array.from(nextHidden),
    };
    setHiddenStepsByFunnel(updatedMap);
    await fetch('/api/home/funnel-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selectedFunnelId,
        hiddenStepsByFunnel: updatedMap,
      }),
    });
  };

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">ファネル</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
            表示ステップを選択できます。
          </p>
        </div>
        <div className="min-w-[220px]">
          <select
            value={selectedFunnelId ?? ''}
            onChange={(event) => handleSelect(event.target.value)}
            className="h-9 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text-primary)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
          >
            {funnels.map((funnel) => (
              <option key={funnel.id} value={funnel.id}>
                {funnel.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedFunnel ? (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
          <div className="space-y-3">
            {loading ? (
              <p className="text-sm text-[color:var(--color-text-muted)]">読み込み中...</p>
            ) : null}
            {error ? (
              <p className="text-sm text-[color:var(--color-danger)]">{error}</p>
            ) : null}
            {!loading && !error && displaySteps.map((step) => (
              <div key={step.stepId} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-[color:var(--color-text-primary)]">{step.label}</span>
                  <span className="text-sm font-semibold text-[color:var(--color-text-primary)]">
                    {formatNumber(step.reached)}{getStepUnit(step.stepId)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-[color:var(--color-text-secondary)]">
                  <span>前ステップから {formatPercent(step.conversionRate)}</span>
                  <span>全体比 {formatPercent(step.overallRate)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
            <p className="text-sm font-medium text-[color:var(--color-text-secondary)]">表示ステップ</p>
            <div className="mt-3 space-y-2">
              {selectedFunnel.steps.map((step) => (
                <label key={step.id} className="flex items-center justify-between text-sm text-[color:var(--color-text-primary)]">
                  <span>{step.label}</span>
                  <input
                    type="checkbox"
                    checked={!hiddenSet.has(step.id)}
                    onChange={() => handleToggleStep(step.id)}
                  />
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-[color:var(--color-text-muted)]">
              非表示にしたステップは自動でスキップし、次のステップで遷移率を再計算します。
            </p>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-[color:var(--color-text-muted)]">ファネルが未登録です。</p>
      )}
    </Card>
  );
}
