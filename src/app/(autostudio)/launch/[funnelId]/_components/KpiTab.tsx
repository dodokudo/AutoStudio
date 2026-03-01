'use client';

import { useState, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { dashboardCardClass } from '@/components/dashboard/styles';
import type { LaunchKpi, SeminarDay } from '@/types/launch';

// ------- Props -------

interface KpiTabProps {
  funnelId: string;
}

// ------- Fetcher -------

interface KpiResponse {
  kpi: LaunchKpi;
  isDefault: boolean;
}

const fetcher = async (url: string): Promise<KpiResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return { kpi: json.kpi as LaunchKpi, isDefault: json.isDefault as boolean };
};

// ------- Formatters -------

const numFmt = new Intl.NumberFormat('ja-JP');
const pctFmt = new Intl.NumberFormat('ja-JP', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function yen(v: number): string {
  return `\u00A5${numFmt.format(v)}`;
}

function pct(v: number): string {
  return `${pctFmt.format(v)}%`;
}

function safeDivide(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}

// ------- Defaults -------

function defaultKpi(): LaunchKpi {
  return {
    kgi: { target: 0, unitPrice: 0 },
    inflow: {
      threads: { target: 0, actual: 0 },
      instagram: { target: 0, actual: 0 },
      ads: { target: 0, actual: 0, budget: 0 },
    },
    lineRegistration: { existing: 0, newTarget: 0, newActual: 0 },
    benefitReceivers: { target: 0, actual: 0 },
    seminarApplications: { target: 0, actual: 0, existingTarget: 0, existingActual: 0, newTarget: 0, newActual: 0 },
    seminarDays: [],
    frontend: { unitPrice: 0, target: 0, actual: 0 },
    backend: { unitPrice: 0, isVariable: false, target: 0, actual: 0, revenue: 0 },
  };
}

// ------- Component -------

export function KpiTab({ funnelId }: KpiTabProps) {
  const { data: response, error, isLoading, mutate: revalidate } = useSWR<KpiResponse>(
    `/api/launch/kpi/${funnelId}`,
    fetcher,
  );

  const data = response?.kpi ?? null;

  const [draft, setDraft] = useState<LaunchKpi | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Use draft if editing, otherwise remote data, otherwise defaults
  const kpi = draft ?? data ?? defaultKpi();

  // Ensure draft exists on first field interaction
  const ensureDraft = useCallback(() => {
    if (!draft) setDraft(structuredClone(data ?? defaultKpi()));
  }, [draft, data]);

  // ------- Updaters -------

  const update = useCallback(
    (updater: (prev: LaunchKpi) => LaunchKpi) => {
      setDraft((prev) => {
        const base = prev ?? structuredClone(data ?? defaultKpi());
        return updater(base);
      });
    },
    [data],
  );

  const setField = useCallback(
    (path: string[], value: number | boolean) => {
      update((prev) => {
        const next = structuredClone(prev);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let obj: any = next;
        for (let i = 0; i < path.length - 1; i++) {
          obj = obj[path[i]];
        }
        obj[path[path.length - 1]] = value;
        // Auto-sync seminarApplications totals from existing + new
        if (path[0] === 'seminarApplications') {
          const sa = next.seminarApplications;
          sa.target = (sa.existingTarget ?? 0) + (sa.newTarget ?? 0);
          sa.actual = (sa.existingActual ?? 0) + (sa.newActual ?? 0);
        }
        return next;
      });
    },
    [update],
  );

  const setSeminarDay = useCallback(
    (index: number, field: keyof SeminarDay, value: string | number) => {
      update((prev) => {
        const next = structuredClone(prev);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (next.seminarDays[index] as any)[field] = value;
        return next;
      });
    },
    [update],
  );

  const addSeminarDay = useCallback(() => {
    update((prev) => {
      const next = structuredClone(prev);
      next.seminarDays.push({
        date: new Date().toISOString().slice(0, 10),
        recruitTarget: 0,
        recruitActual: 0,
        attendTarget: 0,
        attendActual: 0,
        purchaseTarget: 0,
        purchaseCount: 0,
      });
      return next;
    });
  }, [update]);

  const removeSeminarDay = useCallback(
    (index: number) => {
      update((prev) => {
        const next = structuredClone(prev);
        next.seminarDays.splice(index, 1);
        return next;
      });
    },
    [update],
  );

  // ------- Computed values -------

  const computed = useMemo(() => {
    const totalNewLine =
      kpi.inflow.threads.actual + kpi.inflow.instagram.actual + kpi.inflow.ads.actual;
    const totalNewLineTarget =
      kpi.inflow.threads.target + kpi.inflow.instagram.target + kpi.inflow.ads.target;
    const adsCpa = safeDivide(kpi.inflow.ads.budget, kpi.inflow.ads.actual);
    const totalLineBase = totalNewLine + kpi.lineRegistration.existing;
    const benefitRate = safeDivide(kpi.benefitReceivers.actual, totalLineBase) * 100;
    const seminarAppRate =
      safeDivide(kpi.seminarApplications.actual, kpi.benefitReceivers.actual) * 100;

    // Seminar totals
    const seminarTotals = kpi.seminarDays.reduce(
      (acc, d) => ({
        recruitTarget: acc.recruitTarget + d.recruitTarget,
        recruitActual: acc.recruitActual + (d.recruitActual ?? 0),
        attendTarget: acc.attendTarget + d.attendTarget,
        attendActual: acc.attendActual + d.attendActual,
        purchaseTarget: acc.purchaseTarget + (d.purchaseTarget ?? 0),
        purchaseCount: acc.purchaseCount + d.purchaseCount,
      }),
      { recruitTarget: 0, recruitActual: 0, attendTarget: 0, attendActual: 0, purchaseTarget: 0, purchaseCount: 0 },
    );
    const seminarAttendRate =
      safeDivide(seminarTotals.attendActual, seminarTotals.attendTarget) * 100;
    const seminarPurchaseRate =
      safeDivide(seminarTotals.purchaseCount, seminarTotals.purchaseTarget) * 100;

    // Sales
    const frontendRevenue = kpi.frontend.unitPrice * kpi.frontend.actual;
    const frontendTargetRevenue = kpi.frontend.unitPrice * kpi.frontend.target;
    const frontendPurchaseRate =
      safeDivide(kpi.frontend.actual, seminarTotals.attendActual) * 100;
    const backendRevenue = kpi.backend.revenue || kpi.backend.unitPrice * kpi.backend.actual;
    const backendTargetRevenue = kpi.backend.isVariable ? 0 : kpi.backend.unitPrice * kpi.backend.target;
    const backendPurchaseRate =
      safeDivide(kpi.backend.actual, kpi.frontend.actual) * 100;
    const totalRevenue = frontendRevenue + backendRevenue;
    const totalTargetRevenue = frontendTargetRevenue + backendTargetRevenue;
    const roas = safeDivide(totalRevenue, kpi.inflow.ads.budget);

    return {
      totalNewLine,
      totalNewLineTarget,
      adsCpa,
      totalLineBase,
      benefitRate,
      seminarAppRate,
      seminarTotals,
      seminarAttendRate,
      seminarPurchaseRate,
      frontendRevenue,
      frontendTargetRevenue,
      frontendPurchaseRate,
      backendRevenue,
      backendTargetRevenue,
      backendPurchaseRate,
      totalRevenue,
      totalTargetRevenue,
      roas,
    };
  }, [kpi]);

  // ------- Save -------

  const handleSave = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/launch/kpi/${funnelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(await res.text());
      await revalidate();
      setDraft(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [draft, funnelId, revalidate]);

  const handleReset = useCallback(() => {
    setDraft(null);
    setSaveError(null);
  }, []);

  // ------- Loading / Error -------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-[color:var(--color-text-muted)]">
        KPIデータを読み込み中...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-red-500">
        データ取得に失敗しました: {error.message}
      </div>
    );
  }

  // ------- Render helpers -------

  const isDirty = draft !== null;

  return (
    <div className="flex flex-col gap-6" onFocus={ensureDraft}>
      {/* Save bar */}
      {isDirty && (
        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 rounded-lg border border-[color:var(--color-accent)] bg-[color:var(--color-surface)] px-4 py-3 shadow-md">
          <span className="text-sm font-medium text-[color:var(--color-text-primary)]">
            未保存の変更があります
          </span>
          <div className="flex items-center gap-2">
            {saveError && (
              <span className="text-xs text-red-500">{saveError}</span>
            )}
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="rounded-md border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-surface-muted)] disabled:opacity-50"
            >
              リセット
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-[color:var(--color-accent)] px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}

      {/* Revenue summary (top) */}
      <div className={dashboardCardClass}>
        <h3 className="mb-4 text-sm font-semibold text-[color:var(--color-text-primary)]">
          売上サマリー
        </h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <p className="text-xs text-[color:var(--color-text-muted)]">目標総売上</p>
            <p className="mt-1 text-lg font-bold text-[color:var(--color-text-secondary)]">
              {yen(computed.totalTargetRevenue)}
            </p>
            <p className="text-[10px] text-[color:var(--color-text-muted)]">
              KGI: {yen(kpi.kgi.target)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[color:var(--color-text-muted)]">実績総売上</p>
            <p className="mt-1 text-lg font-bold text-[color:var(--color-accent)]">
              {yen(computed.totalRevenue)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[color:var(--color-text-muted)]">FE売上</p>
            <p className="mt-1 text-lg font-bold text-[color:var(--color-text-primary)]">
              {yen(computed.frontendRevenue)}
            </p>
            <p className="text-[10px] text-[color:var(--color-text-muted)]">
              目標: {yen(computed.frontendTargetRevenue)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[color:var(--color-text-muted)]">BE売上</p>
            <p className="mt-1 text-lg font-bold text-[color:var(--color-text-primary)]">
              {yen(computed.backendRevenue)}
            </p>
            <p className="text-[10px] text-[color:var(--color-text-muted)]">
              目標: {yen(computed.backendTargetRevenue)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[color:var(--color-text-muted)]">広告費</p>
            <p className="mt-1 text-lg font-bold text-[color:var(--color-text-primary)]">
              {yen(kpi.inflow.ads.budget)}
            </p>
          </div>
          <div>
            <p className="text-xs text-[color:var(--color-text-muted)]">ROAS</p>
            <p
              className="mt-1 text-lg font-bold"
              style={{
                color:
                  computed.roas >= 3
                    ? '#16A34A'
                    : computed.roas >= 1
                      ? '#CA8A04'
                      : computed.roas > 0
                        ? '#DC2626'
                        : undefined,
              }}
            >
              {computed.roas > 0 ? `${pctFmt.format(computed.roas * 100)}%` : '-'}
            </p>
          </div>
        </div>
      </div>

      {/* 1. Summary cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <SummaryCard
          label="KGI (売上目標)"
          value={yen(kpi.kgi.target)}
          input={
            <NumberInput
              value={kpi.kgi.target}
              onChange={(v) => setField(['kgi', 'target'], v)}
              prefix="¥"
            />
          }
        />
        <SummaryCard
          label="平均単価"
          value={yen(kpi.kgi.unitPrice)}
          input={
            <NumberInput
              value={kpi.kgi.unitPrice}
              onChange={(v) => setField(['kgi', 'unitPrice'], v)}
              prefix="¥"
            />
          }
        />
        <SummaryCard
          label="広告予算"
          value={yen(kpi.inflow.ads.budget)}
          input={
            <NumberInput
              value={kpi.inflow.ads.budget}
              onChange={(v) => setField(['inflow', 'ads', 'budget'], v)}
              prefix="¥"
            />
          }
        />
        <SummaryCard
          label="ROAS"
          value={computed.roas > 0 ? `${pctFmt.format(computed.roas * 100)}%` : '-'}
          computed
        />
      </div>

      {/* 2. Funnel steps */}
      <div className="flex flex-col gap-0">
        {/* Step 1: Inflow */}
        <StepCard step={1} title="流入">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ChannelRow
              label="Threads"
              target={kpi.inflow.threads.target}
              actual={kpi.inflow.threads.actual}
              onTargetChange={(v) => setField(['inflow', 'threads', 'target'], v)}
              onActualChange={(v) => setField(['inflow', 'threads', 'actual'], v)}
              suffix="人"
            />
            <ChannelRow
              label="Instagram"
              target={kpi.inflow.instagram.target}
              actual={kpi.inflow.instagram.actual}
              onTargetChange={(v) => setField(['inflow', 'instagram', 'target'], v)}
              onActualChange={(v) => setField(['inflow', 'instagram', 'actual'], v)}
              suffix="人"
            />
            <div>
              <ChannelRow
                label="広告"
                target={kpi.inflow.ads.target}
                actual={kpi.inflow.ads.actual}
                onTargetChange={(v) => setField(['inflow', 'ads', 'target'], v)}
                onActualChange={(v) => setField(['inflow', 'ads', 'actual'], v)}
                suffix="人"
              />
              <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                CPA: {computed.adsCpa > 0 ? yen(Math.round(computed.adsCpa)) : '-'}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[color:var(--color-border)] pt-4">
            <MetricPill
              label="合計新規LINE登録"
              value={`${numFmt.format(computed.totalNewLine)}人`}
              sub={`目標: ${numFmt.format(computed.totalNewLineTarget)}人`}
              computed
            />
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[color:var(--color-text-muted)]">
                既存LINE登録者数
              </span>
              <NumberInput
                value={kpi.lineRegistration.existing}
                onChange={(v) => setField(['lineRegistration', 'existing'], v)}
                suffix="人"
                compact
              />
            </div>
          </div>
        </StepCard>

        <StepArrow />

        {/* Step 2: Benefit */}
        <StepCard step={2} title="特典受取">
          <div className="flex flex-wrap items-center gap-4">
            <TargetActualRow
              target={kpi.benefitReceivers.target}
              actual={kpi.benefitReceivers.actual}
              onTargetChange={(v) => setField(['benefitReceivers', 'target'], v)}
              onActualChange={(v) => setField(['benefitReceivers', 'actual'], v)}
              suffix="人"
            />
            <MetricPill
              label="受取率"
              value={computed.benefitRate > 0 ? pct(computed.benefitRate) : '-'}
              computed
            />
          </div>
        </StepCard>

        <StepArrow />

        {/* Step 3: Seminar Application */}
        <StepCard step={3} title="セミナー申込">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-medium text-[color:var(--color-text-secondary)]">既存LINE友だち</p>
              <div className="flex items-center gap-3">
                <FieldGroup label="目標" inline>
                  <NumberInput
                    value={kpi.seminarApplications.existingTarget ?? 0}
                    onChange={(v) => setField(['seminarApplications', 'existingTarget'], v)}
                    suffix="人"
                    compact
                  />
                </FieldGroup>
                <FieldGroup label="実績" inline>
                  <NumberInput
                    value={kpi.seminarApplications.existingActual ?? 0}
                    onChange={(v) => setField(['seminarApplications', 'existingActual'], v)}
                    suffix="人"
                    compact
                  />
                </FieldGroup>
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-[color:var(--color-text-secondary)]">新規LINE登録者</p>
              <div className="flex items-center gap-3">
                <FieldGroup label="目標" inline>
                  <NumberInput
                    value={kpi.seminarApplications.newTarget ?? 0}
                    onChange={(v) => setField(['seminarApplications', 'newTarget'], v)}
                    suffix="人"
                    compact
                  />
                </FieldGroup>
                <FieldGroup label="実績" inline>
                  <NumberInput
                    value={kpi.seminarApplications.newActual ?? 0}
                    onChange={(v) => setField(['seminarApplications', 'newActual'], v)}
                    suffix="人"
                    compact
                  />
                </FieldGroup>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[color:var(--color-border)] pt-4">
            <MetricPill
              label="合計目標"
              value={`${numFmt.format(kpi.seminarApplications.target)}人`}
              computed
            />
            <MetricPill
              label="合計実績"
              value={`${numFmt.format(kpi.seminarApplications.actual)}人`}
              computed
            />
            <MetricPill
              label="申込率"
              value={computed.seminarAppRate > 0 ? pct(computed.seminarAppRate) : '-'}
              computed
            />
          </div>
        </StepCard>

        <StepArrow />

        {/* Step 4: Seminar Attendance (daily table) */}
        <StepCard step={4} title="セミナー参加">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-xs font-medium text-[color:var(--color-text-muted)]">
                  <th className="whitespace-nowrap px-2 py-2">日付</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right">集客目標</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right">集客実績</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right">集客率</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right">参加目標</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right">参加実績</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right">参加率</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right">購入目標</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right">購入数</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right">購入率</th>
                  <th className="w-8 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {kpi.seminarDays.map((day, i) => {
                  const recruitRate =
                    safeDivide(day.recruitActual ?? 0, day.recruitTarget) * 100;
                  const attendRate =
                    safeDivide(day.attendActual, day.attendTarget) * 100;
                  const purchaseRate =
                    safeDivide(day.purchaseCount, day.purchaseTarget ?? 0) * 100;
                  return (
                    <tr
                      key={i}
                      className="border-b border-[color:var(--color-border)] last:border-b-0"
                    >
                      <td className="px-2 py-1.5">
                        <input
                          type="date"
                          value={day.date}
                          onChange={(e) => setSeminarDay(i, 'date', e.target.value)}
                          className="w-[140px] rounded border border-transparent bg-[var(--color-surface-muted)] px-2 py-1 text-xs text-[color:var(--color-text-primary)] focus:border-[color:var(--color-accent)] focus:bg-white focus:outline-none"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <NumberInput
                          value={day.recruitTarget}
                          onChange={(v) => setSeminarDay(i, 'recruitTarget', v)}
                          suffix="人"
                          compact
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <NumberInput
                          value={day.recruitActual ?? 0}
                          onChange={(v) => setSeminarDay(i, 'recruitActual', v)}
                          suffix="人"
                          compact
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <span className="text-xs text-[color:var(--color-text-secondary)]">
                          {recruitRate > 0 ? pct(recruitRate) : '-'}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <NumberInput
                          value={day.attendTarget}
                          onChange={(v) => setSeminarDay(i, 'attendTarget', v)}
                          suffix="人"
                          compact
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <NumberInput
                          value={day.attendActual}
                          onChange={(v) => setSeminarDay(i, 'attendActual', v)}
                          suffix="人"
                          compact
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <span className="text-xs text-[color:var(--color-text-secondary)]">
                          {attendRate > 0 ? pct(attendRate) : '-'}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <NumberInput
                          value={day.purchaseTarget ?? 0}
                          onChange={(v) => setSeminarDay(i, 'purchaseTarget', v)}
                          suffix="人"
                          compact
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <NumberInput
                          value={day.purchaseCount}
                          onChange={(v) => setSeminarDay(i, 'purchaseCount', v)}
                          suffix="人"
                          compact
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <span className="text-xs text-[color:var(--color-text-secondary)]">
                          {purchaseRate > 0 ? pct(purchaseRate) : '-'}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeSeminarDay(i)}
                          className="text-[color:var(--color-text-muted)] transition-colors hover:text-red-500"
                          title="削除"
                        >
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                            <path d="M3.5 3.5L10.5 10.5M10.5 3.5L3.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* Totals row */}
                {kpi.seminarDays.length > 0 && (
                  <tr className="bg-[var(--color-surface-muted)] font-medium">
                    <td className="px-2 py-2 text-xs text-[color:var(--color-text-muted)]">
                      合計
                    </td>
                    <td className="px-2 py-2 text-right text-xs">
                      {numFmt.format(computed.seminarTotals.recruitTarget)}人
                    </td>
                    <td className="px-2 py-2 text-right text-xs">
                      {numFmt.format(computed.seminarTotals.recruitActual)}人
                    </td>
                    <td className="px-2 py-2 text-right text-xs">
                      {(() => {
                        const r = safeDivide(computed.seminarTotals.recruitActual, computed.seminarTotals.recruitTarget) * 100;
                        return r > 0 ? pct(r) : '-';
                      })()}
                    </td>
                    <td className="px-2 py-2 text-right text-xs">
                      {numFmt.format(computed.seminarTotals.attendTarget)}人
                    </td>
                    <td className="px-2 py-2 text-right text-xs">
                      {numFmt.format(computed.seminarTotals.attendActual)}人
                    </td>
                    <td className="px-2 py-2 text-right text-xs">
                      {computed.seminarAttendRate > 0 ? pct(computed.seminarAttendRate) : '-'}
                    </td>
                    <td className="px-2 py-2 text-right text-xs">
                      {numFmt.format(computed.seminarTotals.purchaseTarget)}人
                    </td>
                    <td className="px-2 py-2 text-right text-xs">
                      {numFmt.format(computed.seminarTotals.purchaseCount)}人
                    </td>
                    <td className="px-2 py-2 text-right text-xs">
                      {computed.seminarPurchaseRate > 0 ? pct(computed.seminarPurchaseRate) : '-'}
                    </td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            onClick={addSeminarDay}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-[color:var(--color-border)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 3V11M3 7H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            日程追加
          </button>
        </StepCard>

        <StepArrow />

        {/* Step 5: Frontend purchase */}
        <StepCard step={5} title="フロントエンド購入">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <FieldGroup label="単価">
              <NumberInput
                value={kpi.frontend.unitPrice}
                onChange={(v) => setField(['frontend', 'unitPrice'], v)}
                prefix="¥"
              />
            </FieldGroup>
            <FieldGroup label="目標">
              <NumberInput
                value={kpi.frontend.target}
                onChange={(v) => setField(['frontend', 'target'], v)}
                suffix="人"
              />
            </FieldGroup>
            <FieldGroup label="実績">
              <NumberInput
                value={kpi.frontend.actual}
                onChange={(v) => setField(['frontend', 'actual'], v)}
                suffix="人"
              />
            </FieldGroup>
            <FieldGroup label="売上">
              <span className="text-sm font-semibold text-[color:var(--color-text-primary)]">
                {yen(computed.frontendRevenue)}
              </span>
            </FieldGroup>
          </div>
          <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">
            購入率: {computed.frontendPurchaseRate > 0 ? pct(computed.frontendPurchaseRate) : '-'}
          </div>
        </StepCard>

        <StepArrow />

        {/* Step 6: Backend purchase */}
        <StepCard step={6} title="バックエンド購入">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <FieldGroup label="単価">
              <NumberInput
                value={kpi.backend.unitPrice}
                onChange={(v) => setField(['backend', 'unitPrice'], v)}
                prefix="¥"
              />
            </FieldGroup>
            <FieldGroup label="変動単価">
              <label className="flex items-center gap-2 text-xs text-[color:var(--color-text-secondary)]">
                <input
                  type="checkbox"
                  checked={kpi.backend.isVariable}
                  onChange={(e) => setField(['backend', 'isVariable'], e.target.checked)}
                  className="rounded border-[color:var(--color-border)]"
                />
                変動あり
              </label>
            </FieldGroup>
            <FieldGroup label="目標">
              <NumberInput
                value={kpi.backend.target}
                onChange={(v) => setField(['backend', 'target'], v)}
                suffix="人"
              />
            </FieldGroup>
            <FieldGroup label="実績">
              <NumberInput
                value={kpi.backend.actual}
                onChange={(v) => setField(['backend', 'actual'], v)}
                suffix="人"
              />
            </FieldGroup>
            <FieldGroup label="売上">
              {kpi.backend.isVariable ? (
                <NumberInput
                  value={kpi.backend.revenue}
                  onChange={(v) => setField(['backend', 'revenue'], v)}
                  prefix="¥"
                />
              ) : (
                <span className="text-sm font-semibold text-[color:var(--color-text-primary)]">
                  {yen(kpi.backend.unitPrice * kpi.backend.actual)}
                </span>
              )}
            </FieldGroup>
          </div>
          <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">
            購入率: {computed.backendPurchaseRate > 0 ? pct(computed.backendPurchaseRate) : '-'}
          </div>
        </StepCard>
      </div>

    </div>
  );
}

// ------- Sub-components -------

/** Summary card in the top grid */
function SummaryCard({
  label,
  value,
  input,
  computed: isComputed,
}: {
  label: string;
  value: string;
  input?: React.ReactNode;
  computed?: boolean;
}) {
  return (
    <div className={dashboardCardClass}>
      <p className="text-xs font-medium text-[color:var(--color-text-muted)]">{label}</p>
      {isComputed ? (
        <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">{value}</p>
      ) : (
        <div className="mt-1">{input}</div>
      )}
    </div>
  );
}

/** Step card wrapper */
function StepCard({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={dashboardCardClass}>
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--color-accent)] text-[11px] font-bold text-white">
          {step}
        </span>
        <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)]">{title}</h3>
      </div>
      {children}
    </div>
  );
}

/** Arrow between steps */
function StepArrow() {
  return (
    <div className="flex justify-center py-1">
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        className="text-[color:var(--color-text-muted)]"
      >
        <path
          d="M10 4V16M10 16L6 12M10 16L14 12"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/** Channel row: label + target/actual */
function ChannelRow({
  label,
  target,
  actual,
  onTargetChange,
  onActualChange,
  suffix,
}: {
  label: string;
  target: number;
  actual: number;
  onTargetChange: (v: number) => void;
  onActualChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-[color:var(--color-text-secondary)]">
        {label}
      </p>
      <div className="flex items-center gap-2">
        <FieldGroup label="目標" inline>
          <NumberInput value={target} onChange={onTargetChange} suffix={suffix} compact />
        </FieldGroup>
        <FieldGroup label="実績" inline>
          <NumberInput value={actual} onChange={onActualChange} suffix={suffix} compact />
        </FieldGroup>
      </div>
    </div>
  );
}

/** Target + Actual row */
function TargetActualRow({
  target,
  actual,
  onTargetChange,
  onActualChange,
  suffix,
}: {
  target: number;
  actual: number;
  onTargetChange: (v: number) => void;
  onActualChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <FieldGroup label="目標" inline>
        <NumberInput value={target} onChange={onTargetChange} suffix={suffix} compact />
      </FieldGroup>
      <FieldGroup label="実績" inline>
        <NumberInput value={actual} onChange={onActualChange} suffix={suffix} compact />
      </FieldGroup>
    </div>
  );
}

/** Field group with label */
function FieldGroup({
  label,
  inline,
  children,
}: {
  label: string;
  inline?: boolean;
  children: React.ReactNode;
}) {
  if (inline) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-[color:var(--color-text-muted)]">{label}</span>
        {children}
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium text-[color:var(--color-text-muted)]">{label}</p>
      {children}
    </div>
  );
}

/** Metric pill (computed value display) */
function MetricPill({
  label,
  value,
  sub,
  computed: isComputed,
}: {
  label: string;
  value: string;
  sub?: string;
  computed?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md bg-[var(--color-surface-muted)] px-3 py-1.5">
      <span className="text-xs text-[color:var(--color-text-muted)]">{label}</span>
      <span className="text-sm font-semibold text-[color:var(--color-text-primary)]">{value}</span>
      {sub && (
        <span className="text-[10px] text-[color:var(--color-text-muted)]">{sub}</span>
      )}
    </div>
  );
}

/** Number input with prefix/suffix and formatting */
function NumberInput({
  value,
  onChange,
  prefix,
  suffix,
  compact,
}: {
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
  compact?: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-0.5">
      {prefix && (
        <span className="text-xs text-[color:var(--color-text-muted)]">{prefix}</span>
      )}
      <input
        type="number"
        value={value || ''}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        placeholder="0"
        className={`rounded border border-transparent bg-[var(--color-surface-muted)] text-right text-[color:var(--color-text-primary)] focus:border-[color:var(--color-accent)] focus:bg-white focus:outline-none ${
          compact ? 'w-[80px] px-2 py-1 text-xs' : 'w-[120px] px-2.5 py-1.5 text-sm'
        }`}
      />
      {suffix && (
        <span className="text-xs text-[color:var(--color-text-muted)]">{suffix}</span>
      )}
    </div>
  );
}
