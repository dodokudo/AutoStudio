'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { Card } from '@/components/ui/card';
import type { LaunchKpi } from '@/types/launch';

interface AutomationKpiTargetsProps {
  funnelId: string;
  actual: {
    targetPeople: number;
    applications: number;
    purchases: number;
  };
}

interface KpiResponse {
  kpi: LaunchKpi;
  isDefault: boolean;
}

const fetcher = async (url: string) => {
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? 'KPIの取得に失敗しました');
  return json as KpiResponse;
};

const numberFormatter = new Intl.NumberFormat('ja-JP');

function achievement(actual: number, target: number): string {
  if (target <= 0) return '-';
  return `${Math.round((actual / target) * 1000) / 10}%`;
}

function MetricInput({
  label,
  target,
  actual,
  suffix = '人',
  onChange,
}: {
  label: string;
  target: number;
  actual: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <label className="text-xs font-semibold text-[color:var(--color-text-secondary)]">
        {label}目標
      </label>
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={target}
          onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
          className="min-w-0 flex-1 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-2 text-right text-lg font-semibold tabular-nums outline-none focus:border-emerald-500"
        />
        <span className="text-xs text-[color:var(--color-text-muted)]">{suffix}</span>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-[color:var(--color-border)] pt-3">
        <span className="text-xs text-[color:var(--color-text-muted)]">現在の実績</span>
        <span className="text-lg font-bold tabular-nums text-[color:var(--color-text-primary)]">
          {numberFormatter.format(actual)}{suffix}
        </span>
      </div>
      <p className="mt-1 text-right text-xs font-semibold text-emerald-700">
        達成率 {achievement(actual, target)}
      </p>
    </div>
  );
}

export function AutomationKpiTargets({ funnelId, actual }: AutomationKpiTargetsProps) {
  const { data, error, isLoading } = useSWR<KpiResponse>(`/api/launch/kpi/${funnelId}`, fetcher, {
    revalidateOnFocus: false,
  });
  const [kpi, setKpi] = useState<LaunchKpi | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (data?.kpi) setKpi(data.kpi);
  }, [data]);

  const save = async () => {
    if (!kpi) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/launch/kpi/${funnelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kpi),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? '保存に失敗しました');
      setMessage('目標値を保存しました');
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <Card className="p-5">
        <p className="text-sm font-semibold text-red-600">KPI目標を取得できませんでした</p>
      </Card>
    );
  }

  if (isLoading || !kpi) {
    return (
      <Card className="p-5">
        <p className="text-sm text-[color:var(--color-text-secondary)]">KPI目標を読み込み中...</p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[color:var(--color-text-primary)]">KPI目標と現在の実績</h2>
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
            目標は手入力、実績は最新のLSTEPデータから自動更新されます。来訪者数は計測対象外です。
          </p>
        </div>
        <div className="flex items-center gap-3">
          {message ? (
            <span className={`text-xs ${message.includes('保存しました') ? 'text-emerald-700' : 'text-red-600'}`}>
              {message}
            </span>
          ) : null}
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-50"
          >
            {saving ? '保存中…' : '目標を保存'}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <MetricInput
          label="計測対象"
          target={kpi.lineRegistration.newTarget}
          actual={actual.targetPeople}
          onChange={(value) => setKpi((current) => current ? ({
            ...current,
            lineRegistration: { ...current.lineRegistration, newTarget: value },
          }) : current)}
        />
        <MetricInput
          label="セミナー申込"
          target={kpi.seminarApplications.target}
          actual={actual.applications}
          onChange={(value) => setKpi((current) => current ? ({
            ...current,
            seminarApplications: { ...current.seminarApplications, target: value },
          }) : current)}
        />
        <MetricInput
          label="フロント購入"
          target={kpi.frontend.target}
          actual={actual.purchases}
          onChange={(value) => setKpi((current) => current ? ({
            ...current,
            frontend: { ...current.frontend, target: value },
          }) : current)}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-[color:var(--color-surface-muted)] px-4 py-3">
        <label className="text-xs font-semibold text-[color:var(--color-text-secondary)]">フロント単価</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={kpi.frontend.unitPrice}
            onChange={(event) => {
              const value = Math.max(0, Number(event.target.value) || 0);
              setKpi((current) => current ? ({
                ...current,
                frontend: { ...current.frontend, unitPrice: value },
              }) : current);
            }}
            className="w-36 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-right text-sm font-semibold tabular-nums outline-none focus:border-emerald-500"
          />
          <span className="text-xs text-[color:var(--color-text-muted)]">円</span>
        </div>
        <span className="ml-auto text-sm font-semibold text-[color:var(--color-text-primary)]">
          現在の売上 {numberFormatter.format(actual.purchases * kpi.frontend.unitPrice)}円
        </span>
      </div>
    </Card>
  );
}
