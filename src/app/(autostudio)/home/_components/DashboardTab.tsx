'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { dashboardCardClass } from '@/components/dashboard/styles';
import type { HomeDashboardData } from '@/lib/home/dashboard';
import type { KpiTarget } from '@/lib/home/kpi-types';
import type { DailyActuals, MonthlyActuals } from '@/lib/home/monthly-actuals';
import {
  activityFields,
  conversionRows,
  goalFields,
  monthDates,
  percentage,
  type MonthlyPlan,
} from '@/lib/home/monthly-plan-types';
import { LineSourceBreakdown } from './LineSourceBreakdown';
import { HomeFunnelPanel } from './HomeFunnelPanel';
import { DailyTrendChart } from './DailyTrendChart';
import { DailyDetailsTable } from './DailyDetailsTable';
import { ActivityActualsForm, MonthlyPlanSection } from './MonthlyPlanSection';

async function fetcher(url: string) {
  const response = await fetch(url);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? '読み込みに失敗しました');
  return result;
}
const number = (value: number) => value.toLocaleString('ja-JP', { maximumFractionDigits: 1 });
export function DashboardTab({
  data,
  kpiTarget,
  currentMonth,
}: {
  data: HomeDashboardData;
  kpiTarget: KpiTarget | null;
  currentMonth: string;
}) {
  const [saving, setSaving] = useState(false);
  const [funnelOpen, setFunnelOpen] = useState(false);
  const {
    data: response,
    error: actualsError,
    isLoading,
  } = useSWR<{ data: MonthlyActuals & { daily: DailyActuals[] } }>(
    `/api/home/monthly-actuals?month=${currentMonth}&daily=true`,
    fetcher,
    { refreshInterval: 60000 }
  );
  const {
    data: plan,
    error: planError,
    mutate,
  } = useSWR<MonthlyPlan>(`/api/home/monthly-plan?month=${currentMonth}`, fetcher, { revalidateOnFocus: false });
  const actuals = response?.data;
  const daily = actuals?.daily ?? [];
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const totalDays = Number(monthDates(currentMonth).end.slice(-2));
  const daysElapsed =
    currentMonth > today.slice(0, 7) ? 0 : currentMonth < today.slice(0, 7) ? totalDays : Number(today.slice(-2));
  const baseActuals: Record<string, number | null> = {
    targetRevenue: actuals?.revenue ?? null,
    targetBackendPurchases: actuals?.backendPurchases ?? null,
    targetFrontendPurchases: actuals?.frontendPurchases ?? null,
    targetLineRegistrations: actuals?.lineRegistrations ?? null,
    targetThreadsFollowers: actuals ? daily.reduce((sum, d) => sum + d.threadsFollowerDelta, 0) : null,
    targetInstagramFollowers: actuals ? daily.reduce((sum, d) => sum + d.instagramFollowerDelta, 0) : null,
    ...Object.fromEntries(activityFields.map(([key, , target]) => [target, plan?.activities[key] ?? null])),
  };
  const rows = goalFields.map(([key, label, unit]) => {
    const value = baseActuals[key];
    const target = kpiTarget?.[key] ?? 0;
    const format = (n: number) => (key === 'targetRevenue' ? `${number(n)}円` : `${number(n)}${unit}`);
    return {
      key,
      label,
      value,
      target,
      display:
        value == null
          ? [
              'targetSeminarRegistrations',
              'targetSeminarParticipants',
              'targetConsultationRegistrations',
              'targetConsultationsCompleted',
            ].includes(key)
            ? '未入力'
            : isLoading
              ? '読込中…'
              : '—'
          : format(value),
      goal: target > 0 ? format(target) : '未設定',
      rate: percentage(value, target),
    };
  });
  async function savePlan(next: MonthlyPlan) {
    setSaving(true);
    try {
      const response = await fetch('/api/home/monthly-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? '保存に失敗しました');
      await mutate(result, { revalidate: false });
    } finally {
      setSaving(false);
    }
  }
  const rates = conversionRows({
    line: actuals?.lineRegistrations ?? null,
    seminarApplications: plan?.activities.seminarRegistrations ?? null,
    seminarAttendance: plan?.activities.seminarParticipants ?? null,
    consultationApplications: plan?.activities.consultationRegistrations ?? null,
    consultations: plan?.activities.consultationsCompleted ?? null,
    backend: actuals?.backendPurchases ?? null,
  });
  return (
    <div className="space-y-6">
      {(actualsError || planError) && (
        <p role="alert" className="text-sm text-red-500">
          {actualsError ? '実績' : '月間タスク'}の読み込みに失敗しました。ページを再読み込みしてください。
        </p>
      )}
      <Card className={dashboardCardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">月の目標と実績</h2>
          <span className="text-xs text-[color:var(--color-text-muted)]">
            {daysElapsed === 0 ? '開始前' : `${daysElapsed} / ${totalDays}日`}
          </span>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {rows
            .filter((row) => ['targetRevenue', 'targetBackendPurchases', 'targetLineRegistrations'].includes(row.key))
            .map((row) => (
              <div key={row.key} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-4">
                <p className="text-sm font-medium">{row.label}</p>
                <p className="mt-2 text-xl font-semibold">{row.display}</p>
                <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  目標 {row.goal} · 達成率 {row.rate}
                </p>
                {row.target > 0 && row.value !== null && (
                  <div className="mt-3 h-2 rounded-full bg-[color:var(--color-border)]">
                    <div
                      className="h-2 rounded-full bg-[color:var(--color-accent)]"
                      style={{ width: `${Math.max(0, Math.min(100, (row.value / row.target) * 100))}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)]">
                <th className="py-3 text-left">項目</th>
                <th className="py-3 text-right">実績</th>
                <th className="py-3 text-right">目標</th>
                <th className="py-3 text-right">達成率</th>
              </tr>
            </thead>
            <tbody>
              {rows
                .filter(
                  (row) => !['targetRevenue', 'targetBackendPurchases', 'targetLineRegistrations'].includes(row.key)
                )
                .map((row) => (
                  <tr key={row.key} className="border-b border-[color:var(--color-border)]">
                    <th className="py-3 text-left font-medium">{row.label}</th>
                    <td className="py-3 text-right">{row.display}</td>
                    <td className="py-3 text-right">{row.goal}</td>
                    <td className="py-3 text-right">{row.rate}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {!kpiTarget && (
          <p className="mt-4 text-sm text-[color:var(--color-text-muted)]">
            「KPI目標設定」でこの月の目標を設定できます。
          </p>
        )}
        {plan && (
          <div className="mt-4">
            <ActivityActualsForm plan={plan} onSave={savePlan} saving={saving} />
          </div>
        )}
      </Card>
      {plan ? (
        <MonthlyPlanSection plan={plan} onSave={savePlan} saving={saving} />
      ) : (
        !planError && (
          <Card className={dashboardCardClass}>
            <p className="text-sm">月間タスクを読み込み中…</p>
          </Card>
        )
      )}
      <Card className={dashboardCardClass}>
        <details>
          <summary className="cursor-pointer font-medium">転換率</summary>
          <p className="mt-3 text-xs text-[color:var(--color-text-muted)]">選択月の件数比</p>
          <div className="mt-3 space-y-3 text-sm">
            {rates.map(([label, rate]) => (
              <div key={label} className="flex justify-between gap-4">
                <span>{label}</span>
                <span>{rate}</span>
              </div>
            ))}
          </div>
        </details>
      </Card>
      <LineSourceBreakdown data={data.lineRegistrationBySource || []} />
      <Card className={dashboardCardClass}>
        <details onToggle={(event) => setFunnelOpen(event.currentTarget.open)}>
          <summary className="cursor-pointer font-medium">ファネル詳細</summary>
          {funnelOpen && (
            <div className="mt-4">
              <HomeFunnelPanel startDate={data.period.start} endDate={data.period.end} />
            </div>
          )}
        </details>
      </Card>
      {isLoading ? (
        <Card className={dashboardCardClass}>
          <p className="text-sm">日別実績を読み込み中…</p>
        </Card>
      ) : (
        <>
          <DailyTrendChart data={daily} />
          <DailyDetailsTable data={daily} kpiTarget={kpiTarget} daysElapsed={daysElapsed} totalDays={totalDays} />
        </>
      )}
    </div>
  );
}
