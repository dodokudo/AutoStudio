'use client';

import { useCallback, useMemo, useState } from 'react';
import useSWR from 'swr';

import { dashboardCardClass } from '@/components/dashboard/styles';
import type {
  LaunchKpi,
  LimitedLaunchEventDay,
  LimitedLaunchKpi,
  LimitedLaunchSegmentFunnel,
  SeptemberLaunchSnapshot,
} from '@/types/launch';

interface SeptemberLaunchKpiProps {
  funnelId: string;
  mode: 'summary' | 'input';
}

interface KpiResponse {
  kpi: LaunchKpi;
  isDefault: boolean;
  lstepSnapshot?: SeptemberLaunchSnapshot | null;
}

const numberFormatter = new Intl.NumberFormat('ja-JP');
const percentFormatter = new Intl.NumberFormat('ja-JP', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const smallPercentFormatter = new Intl.NumberFormat('ja-JP', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fetcher = async (url: string): Promise<KpiResponse> => {
  const response = await fetch(url);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? 'KPIデータの取得に失敗しました');
  return json as KpiResponse;
};

function emptyKpi(): LaunchKpi {
  return {
    kgi: { target: 0, unitPrice: 0 },
    inflow: {
      threads: { target: 0, actual: 0 },
      instagram: { target: 0, actual: 0 },
      ads: { target: 0, actual: 0, budget: 0 },
    },
    lineRegistration: { existing: 0, newTarget: 0, newActual: 0 },
    videoViewers: { target: 0, actual: 0 },
    seminarApplications: { target: 0, actual: 0 },
    seminarDays: [],
    frontend: { unitPrice: 0, target: 0, actual: 0 },
    backend: { unitPrice: 0, isVariable: false, target: 0, actual: 0, revenue: 0 },
  };
}

export const SEPTEMBER_LAUNCH_INITIAL: LimitedLaunchKpi = {
  measurementStartedAt: '2026-08-28T21:00',
  snapshotDate: '2026-08-29',
  fixedExistingAudience: 1450,
  reachableExistingAudience: 1442,
  newRegistrations: 3,
  backendPurchases: 0,
  targets: {
    revenue: 10_000_000,
    plannedExistingAudience: 1400,
    newRegistrations: 170,
    applications: 150,
    existingApplications: 106,
    newApplications: 51,
    existingApplicationRate: 7.6,
    newApplicationRate: 30,
    attendees: 113,
    attendanceRate: 75,
    frontendPurchases: 20,
    frontendUnitPrice: 100_000,
    attendeeToFrontendRate: 18,
    backendPurchases: 8,
    backendUnitPrice: 1_000_000,
    frontendToBackendRate: 40,
  },
  dailyApplications: [
    { date: '2026-08-28', newRegistrations: 3, existing: 5, new: 0 },
    { date: '2026-08-29', newRegistrations: 0, existing: 3, new: 0 },
    { date: '2026-08-30', newRegistrations: null, existing: null, new: null },
    { date: '2026-08-31', newRegistrations: null, existing: null, new: null },
    { date: '2026-09-01', newRegistrations: null, existing: null, new: null },
    { date: '2026-09-02', newRegistrations: null, existing: null, new: null },
    { date: '2026-09-03', newRegistrations: null, existing: null, new: null },
    { date: '2026-09-04', newRegistrations: null, existing: null, new: null },
    { date: '2026-09-05', newRegistrations: null, existing: null, new: null },
    { date: '2026-09-06', newRegistrations: null, existing: null, new: null },
    { date: '2026-09-07', newRegistrations: null, existing: null, new: null },
  ],
  eventDays: [
    { date: '2026-09-02', applicationTarget: 15, applications: 4, attendanceTarget: 11, attendees: 0, frontendTarget: 2, frontendPurchases: 0 },
    { date: '2026-09-03', isOff: true, applicationTarget: 0, applications: 0, attendanceTarget: 0, attendees: 0, frontendTarget: 0, frontendPurchases: 0 },
    { date: '2026-09-04', applicationTarget: 34, applications: 2, attendanceTarget: 26, attendees: 0, frontendTarget: 5, frontendPurchases: 0 },
    { date: '2026-09-05', applicationTarget: 34, applications: 1, attendanceTarget: 26, attendees: 0, frontendTarget: 5, frontendPurchases: 0 },
    { date: '2026-09-06', applicationTarget: 34, applications: 0, attendanceTarget: 25, attendees: 0, frontendTarget: 4, frontendPurchases: 0 },
    { date: '2026-09-07', applicationTarget: 34, applications: 1, attendanceTarget: 25, attendees: 0, frontendTarget: 4, frontendPurchases: 0 },
  ],
};

function mergeLimitedLaunch(saved?: LimitedLaunchKpi): LimitedLaunchKpi {
  if (!saved) return structuredClone(SEPTEMBER_LAUNCH_INITIAL);

  const dailyByDate = new Map(saved.dailyApplications?.map((row) => [row.date, row]) ?? []);
  const eventByDate = new Map(saved.eventDays?.map((row) => [row.date, row]) ?? []);

  return {
    ...SEPTEMBER_LAUNCH_INITIAL,
    ...saved,
    targets: { ...SEPTEMBER_LAUNCH_INITIAL.targets, ...saved.targets },
    dailyApplications: SEPTEMBER_LAUNCH_INITIAL.dailyApplications.map((row) => ({
      ...row,
      ...dailyByDate.get(row.date),
    })),
    eventDays: SEPTEMBER_LAUNCH_INITIAL.eventDays.map((row) => ({
      ...row,
      ...eventByDate.get(row.date),
    })),
  };
}

function applyLstepSnapshot(
  launch: LimitedLaunchKpi,
  snapshot?: SeptemberLaunchSnapshot | null,
): LimitedLaunchKpi {
  if (!snapshot) return launch;

  const dailyApplications = launch.dailyApplications.map((row) => {
    const isObserved = row.date <= snapshot.snapshotDate;
    const applications = snapshot.dailyApplications[row.date];
    return {
      ...row,
      newRegistrations: isObserved ? (snapshot.dailyNewRegistrations[row.date] ?? 0) : null,
      existing: isObserved ? (applications?.existing ?? 0) : null,
      new: isObserved ? (applications?.new ?? 0) : null,
    };
  });

  return {
    ...launch,
    snapshotDate: snapshot.snapshotDate,
    newRegistrations: dailyApplications.reduce((sum, row) => sum + (row.newRegistrations ?? 0), 0),
    attendees: snapshot.attendees ?? launch.attendees,
    frontendPurchases: snapshot.frontendPurchases ?? launch.frontendPurchases,
    backendPurchases: snapshot.backendPurchases ?? launch.backendPurchases,
    dailyApplications,
    eventDays: launch.eventDays.map((row) => ({
      ...row,
      applications: snapshot.eventApplications[row.date] ?? 0,
      attendees: snapshot.eventAttendees[row.date] ?? row.attendees,
      frontendPurchases: snapshot.eventFrontendPurchases[row.date] ?? row.frontendPurchases,
    })),
  };
}

function dateLabel(date: string, withYear = false): string {
  const [year, month, day] = date.split('-').map(Number);
  return withYear ? `${year}/${month}/${day}` : `${month}/${day}`;
}

function percent(numerator: number, denominator: number): number {
  return denominator > 0 ? (numerator / denominator) * 100 : 0;
}

function pct(value: number): string {
  const formatter = value > 0 && value < 1 ? smallPercentFormatter : percentFormatter;
  return `${formatter.format(value)}%`;
}

function yen(value: number): string {
  return `¥${numberFormatter.format(value)}`;
}

function compactYen(value: number): string {
  if (value >= 10_000) return `${numberFormatter.format(value / 10_000)}万円`;
  return yen(value);
}

function sumApplications(rows: LimitedLaunchKpi['dailyApplications'], segment: 'existing' | 'new'): number {
  return rows.reduce((sum, row) => sum + (row[segment] ?? 0), 0);
}

function sumEvent(rows: LimitedLaunchEventDay[], key: 'applications' | 'attendees' | 'frontendPurchases'): number {
  return rows.reduce((sum, row) => sum + (row.isOff ? 0 : row[key]), 0);
}

function launchMetrics(launch: LimitedLaunchKpi) {
  const hasDailyNewRegistrations = launch.dailyApplications.some((row) => row.newRegistrations !== null);
  const dailyNewRegistrations = launch.dailyApplications.reduce((sum, row) => sum + (row.newRegistrations ?? 0), 0);
  const newRegistrations = hasDailyNewRegistrations ? dailyNewRegistrations : launch.newRegistrations;
  const existingApplications = sumApplications(launch.dailyApplications, 'existing');
  const newApplications = sumApplications(launch.dailyApplications, 'new');
  const applications = existingApplications + newApplications;
  const eventApplications = sumEvent(launch.eventDays, 'applications');
  const attendees = launch.attendees ?? sumEvent(launch.eventDays, 'attendees');
  const frontendPurchases = launch.frontendPurchases ?? sumEvent(launch.eventDays, 'frontendPurchases');
  const blocked = Math.max(0, launch.fixedExistingAudience - launch.reachableExistingAudience);
  const frontendRevenue = frontendPurchases * launch.targets.frontendUnitPrice;
  const backendRevenue = launch.backendPurchases * launch.targets.backendUnitPrice;
  const revenue = frontendRevenue + backendRevenue;

  return {
    newRegistrations,
    existingApplications,
    newApplications,
    applications,
    eventApplications,
    attendees,
    frontendPurchases,
    blocked,
    frontendRevenue,
    backendRevenue,
    revenue,
  };
}

function ProgressBar({ value }: { value: number }) {
  const color = value >= 80 ? '#16A34A' : value >= 50 ? '#CA8A04' : '#DC2626';
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--color-surface-muted)]">
      <div
        className="h-full rounded-full transition-[width] motion-reduce:transition-none"
        style={{ width: `${Math.min(100, Math.max(0, value))}%`, backgroundColor: color }}
      />
    </div>
  );
}

function progressColor(value: number): string {
  if (value >= 80) return '#16A34A';
  if (value >= 50) return '#CA8A04';
  return '#DC2626';
}

function FunnelStep({
  label,
  actual,
  target,
  suffix = '人',
  note,
  targetText,
  showProgress = true,
}: {
  label: string;
  actual: number;
  target: number;
  suffix?: string;
  note?: string;
  targetText?: string;
  showProgress?: boolean;
}) {
  const rate = percent(actual, target);
  return (
    <div className={dashboardCardClass}>
      <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">{label}</p>
      <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
        {targetText ?? `目標 ${suffix === '円' ? compactYen(target) : `${numberFormatter.format(target)}${suffix}`}`}
      </p>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums text-[color:var(--color-text-primary)]">
          {suffix === '円' ? compactYen(actual) : numberFormatter.format(actual)}
        </span>
        {suffix !== '円' ? <span className="text-xs text-[color:var(--color-text-muted)]">{suffix}</span> : null}
      </div>
      {showProgress ? (
        <>
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">{actual >= target ? '達成' : `残り ${numberFormatter.format(Math.max(0, target - actual))}${suffix}`}</p>
          <div className="mt-3"><ProgressBar value={rate} /></div>
          <p className="mt-1.5 text-right text-[11px] font-semibold" style={{ color: progressColor(rate) }}>{pct(rate)}</p>
        </>
      ) : null}
      {note ? <p className="mt-2 border-t border-[color:var(--color-border)] pt-2 text-[11px] text-[color:var(--color-text-muted)]">{note}</p> : null}
    </div>
  );
}

interface SegmentFunnelStage {
  label: string;
  value: number;
  target?: number;
}

function SegmentFunnelCard({
  title,
  meta,
  stages,
  entryValue,
  entryLabel,
}: {
  title: string;
  meta: string;
  stages: SegmentFunnelStage[];
  entryValue?: number;
  entryLabel?: string;
}) {
  return (
    <div className={dashboardCardClass}>
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[color:var(--color-border)] pb-3">
        <div>
          <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">{title}</p>
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">{meta}</p>
        </div>
        {entryValue !== undefined ? (
          <div className="text-right">
            <p className="text-[11px] text-[color:var(--color-text-muted)]">{entryLabel}</p>
            <p className="mt-0.5 text-lg font-bold tabular-nums text-[color:var(--color-text-primary)]">{numberFormatter.format(entryValue)}人</p>
          </div>
        ) : null}
      </div>

      <div className="mt-2">
        {stages.map((stage, index) => {
          const previous = index === 0 ? entryValue : stages[index - 1].value;
          const previousLabel = index === 0 ? entryLabel : stages[index - 1].label;
          const conversion = previous !== undefined && previous > 0 ? percent(stage.value, previous) : null;
          const conversionText = previous === undefined
            ? '計測の起点'
            : `${previousLabel}から ${conversion === null ? '—' : pct(conversion)}`;
          return (
            <div key={stage.label} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-3 border-b border-[color:var(--color-border)] py-3 last:border-0 last:pb-0">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--color-surface-muted)] text-[10px] font-bold tabular-nums text-[color:var(--color-text-secondary)]">
                {String(index + 1).padStart(2, '0')}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[color:var(--color-text-primary)]">{stage.label}</p>
                <p className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">
                  {conversionText}
                  {stage.target !== undefined ? ` ・ 目標 ${numberFormatter.format(stage.target)}人` : ''}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xl font-bold tabular-nums text-[color:var(--color-text-primary)]">{numberFormatter.format(stage.value)}</span>
                <span className="ml-1 text-xs text-[color:var(--color-text-muted)]">人</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-[11px] text-[color:var(--color-text-muted)]">{label}</p>
      <p className={`mt-1 tabular-nums ${strong ? 'text-xl font-bold text-[color:var(--color-accent)]' : 'text-base font-semibold text-[color:var(--color-text-primary)]'}`}>{value}</p>
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-[color:var(--color-text-primary)]">{title}</h2>
      {description ? <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">{description}</p> : null}
    </div>
  );
}

function RateCell({ value, off = false, empty = false }: { value: number; off?: boolean; empty?: boolean }) {
  if (off || empty) return <td className="px-3 py-3 text-right text-[color:var(--color-text-muted)]">—</td>;
  return (
    <td className="px-3 py-3 text-right font-semibold tabular-nums" style={{ color: progressColor(value) }}>
      {pct(value)}
    </td>
  );
}

function SeptemberSummary({
  launch,
  lstepSnapshot,
}: {
  launch: LimitedLaunchKpi;
  lstepSnapshot?: SeptemberLaunchSnapshot | null;
}) {
  const metrics = useMemo(() => launchMetrics(launch), [launch]);
  const lstepConnected = Boolean(lstepSnapshot);
  const emptySegment: LimitedLaunchSegmentFunnel = {
    surveyResponses: 0,
    videoViews: 0,
    applications: 0,
    attendees: 0,
    frontendPurchases: 0,
  };
  const existingFunnel = lstepSnapshot?.segmentFunnels.existing ?? {
    ...emptySegment,
    applications: metrics.existingApplications,
  };
  const newFunnel = lstepSnapshot?.segmentFunnels.new ?? {
    ...emptySegment,
    applications: metrics.newApplications,
  };
  const eventTarget = launch.eventDays.reduce((sum, row) => sum + row.applicationTarget, 0);
  const attendanceTarget = launch.eventDays.reduce((sum, row) => sum + row.attendanceTarget, 0);
  const frontendTarget = launch.eventDays.reduce((sum, row) => sum + row.frontendTarget, 0);

  return (
    <div className="section-stack">
      <section className={dashboardCardClass}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--color-border)] pb-3">
          <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">フロントエンド実績</p>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            {dateLabel(launch.snapshotDate)}時点{lstepConnected ? '・最新LSTEP CSV' : '・入力値'}
          </p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="FE目標売上" value={compactYen(launch.targets.frontendPurchases * launch.targets.frontendUnitPrice)} />
          <Metric label="FE実績売上" value={compactYen(metrics.frontendRevenue)} strong />
          <Metric label="FE購入目標" value={`${numberFormatter.format(launch.targets.frontendPurchases)}人`} />
          <Metric label="FE購入実績" value={`${numberFormatter.format(metrics.frontendPurchases)}人`} />
          <Metric label="BE込み売上目標" value={compactYen(launch.targets.revenue)} />
          <Metric label="BE込み実績" value={compactYen(metrics.revenue)} />
        </div>
        <p className="mt-3 text-[11px] text-[color:var(--color-text-muted)]">総売上目標1,000万円は、FE 200万円とBE 800万円の合計です。</p>
      </section>

      <section>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FunnelStep
            label="既存LINE"
            actual={launch.fixedExistingAudience}
            target={launch.targets.plannedExistingAudience}
            note={`開始時点で固定 / 配信可能 ${numberFormatter.format(launch.reachableExistingAudience)}人 / ブロック ${numberFormatter.format(metrics.blocked)}人 (${pct(percent(metrics.blocked, launch.fixedExistingAudience))})`}
          />
          <FunnelStep label="新規LINE" actual={metrics.newRegistrations} target={launch.targets.newRegistrations} />
          <FunnelStep label="セミナー申込" actual={metrics.applications} target={launch.targets.applications} note={`既存 ${metrics.existingApplications}人 / 新規 ${metrics.newApplications}人`} />
          <FunnelStep label="セミナー参加" actual={metrics.attendees} target={launch.targets.attendees} note={`申込からの参加率 ${pct(percent(metrics.attendees, metrics.applications))}`} />
          <FunnelStep label="フロント購入" actual={metrics.frontendPurchases} target={launch.targets.frontendPurchases} note={`購入率 ${pct(percent(metrics.frontendPurchases, metrics.attendees))} / 売上 ${compactYen(metrics.frontendRevenue)}`} />
        </div>
      </section>

      <section className={dashboardCardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading title="8/28〜9/7 日別推移" description="オプト開始後の新規LINE登録とセミナー申込を日ごとに追います。" />
          <div className="flex gap-5 text-right">
            <div><p className="text-lg font-bold tabular-nums">{metrics.newRegistrations}人</p><p className="text-[11px] text-[color:var(--color-text-muted)]">新規LINE累計</p></div>
            <div><p className="text-lg font-bold tabular-nums">{metrics.applications}人</p><p className="text-[11px] text-[color:var(--color-text-muted)]">セミナー申込累計</p></div>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-xs text-[color:var(--color-text-muted)]">
                <th className="px-3 py-2 text-left font-medium">日付</th>
                <th className="px-3 py-2 text-right font-medium">新規LINE登録</th>
                <th className="px-3 py-2 text-right font-medium">既存から申込</th>
                <th className="px-3 py-2 text-right font-medium">新規から申込</th>
                <th className="px-3 py-2 text-right font-medium">申込合計</th>
                <th className="px-3 py-2 text-right font-medium">新規LINE累計</th>
                <th className="px-3 py-2 text-right font-medium">申込累計</th>
              </tr>
            </thead>
            <tbody>
              {launch.dailyApplications.map((row, index) => {
                const hasData = row.newRegistrations !== null || row.existing !== null || row.new !== null;
                const registrationsCumulative = launch.dailyApplications.slice(0, index + 1).reduce((sum, item) => sum + (item.newRegistrations ?? 0), 0);
                const applicationsCumulative = launch.dailyApplications.slice(0, index + 1).reduce((sum, item) => sum + (item.existing ?? 0) + (item.new ?? 0), 0);
                return (
                  <tr key={row.date} className="border-b border-[color:var(--color-border)] last:border-0">
                    <td className="px-3 py-3 font-medium">{dateLabel(row.date, true)}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{row.newRegistrations ?? '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.existing ?? '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.new ?? '—'}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{hasData ? (row.existing ?? 0) + (row.new ?? 0) : '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-[color:var(--color-text-secondary)]">{hasData ? registrationsCumulative : '—'}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-[color:var(--color-text-secondary)]">{hasData ? applicationsCumulative : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[color:var(--color-border)] font-semibold text-[color:var(--color-text-primary)]">
                <td className="px-3 py-3">合計</td>
                <td className="px-3 py-3 text-right">{metrics.newRegistrations}</td>
                <td className="px-3 py-3 text-right">{metrics.existingApplications}</td>
                <td className="px-3 py-3 text-right">{metrics.newApplications}</td>
                <td className="px-3 py-3 text-right">{metrics.applications}</td>
                <td className="px-3 py-3 text-right">—</td>
                <td className="px-3 py-3 text-right">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className={dashboardCardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeading title="セミナー日別" description="申込・参加・フロント購入を開催日ごとに確認します。" />
          <p className="text-xs text-[color:var(--color-text-muted)]">申込目標合計 {eventTarget}人 / 全体KPI 150人以上</p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-xs text-[color:var(--color-text-muted)]">
                <th className="px-3 py-2 text-left font-medium">開催日</th>
                <th className="px-3 py-2 text-right font-medium">申込目標</th>
                <th className="px-3 py-2 text-right font-medium">申込実績</th>
                <th className="px-3 py-2 text-right font-medium">申込達成率</th>
                <th className="px-3 py-2 text-right font-medium">参加目標</th>
                <th className="px-3 py-2 text-right font-medium">参加実績</th>
                <th className="px-3 py-2 text-right font-medium">参加率</th>
                <th className="px-3 py-2 text-right font-medium">FE目標</th>
                <th className="px-3 py-2 text-right font-medium">FE購入</th>
                <th className="px-3 py-2 text-right font-medium">購入率</th>
              </tr>
            </thead>
            <tbody>
              {launch.eventDays.map((row) => {
                const applicationRate = percent(row.applications, row.applicationTarget);
                const attendanceRate = percent(row.attendees, row.applications);
                const purchaseRate = percent(row.frontendPurchases, row.attendees);
                return (
                  <tr key={row.date} className={`border-b border-[color:var(--color-border)] last:border-0 ${row.isOff ? 'bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-muted)]' : ''}`}>
                    <td className="px-3 py-3 font-medium">{dateLabel(row.date, true)}{row.isOff ? <span className="ml-2 text-xs">休み</span> : null}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.isOff ? '—' : row.applicationTarget}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{row.isOff ? '—' : row.applications}</td>
                    <RateCell value={applicationRate} off={row.isOff} />
                    <td className="px-3 py-3 text-right tabular-nums">{row.isOff ? '—' : row.attendanceTarget}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{row.isOff ? '—' : row.attendees}</td>
                    <RateCell value={attendanceRate} off={row.isOff} empty={row.applications === 0} />
                    <td className="px-3 py-3 text-right tabular-nums">{row.isOff ? '—' : row.frontendTarget}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{row.isOff ? '—' : row.frontendPurchases}</td>
                    <RateCell value={purchaseRate} off={row.isOff} empty={row.attendees === 0} />
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[color:var(--color-border)] font-semibold text-[color:var(--color-text-primary)]">
                <td className="px-3 py-3">合計</td>
                <td className="px-3 py-3 text-right">{eventTarget}</td>
                <td className="px-3 py-3 text-right">{metrics.eventApplications}</td>
                <RateCell value={percent(metrics.eventApplications, eventTarget)} />
                <td className="px-3 py-3 text-right">{attendanceTarget}</td>
                <td className="px-3 py-3 text-right">{metrics.attendees}</td>
                <RateCell value={percent(metrics.attendees, metrics.eventApplications)} empty={metrics.eventApplications === 0} />
                <td className="px-3 py-3 text-right">{frontendTarget}</td>
                <td className="px-3 py-3 text-right">{metrics.frontendPurchases}</td>
                <RateCell value={percent(metrics.frontendPurchases, metrics.attendees)} empty={metrics.attendees === 0} />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section>
        <SectionHeading title="新規・既存ファネル" description="各段階の実数と、直前の段階から進んだ割合を確認します。" />
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <SegmentFunnelCard
            title="新規ファネル"
            meta="8/28 21:00以降の友だち登録に連動"
            stages={[
              { label: '新規LINE登録', value: metrics.newRegistrations, target: launch.targets.newRegistrations },
              { label: 'アンケート回答', value: newFunnel.surveyResponses },
              { label: '動画閲覧', value: newFunnel.videoViews },
              { label: 'セミナー申込', value: newFunnel.applications, target: launch.targets.newApplications },
              { label: 'セミナー参加', value: newFunnel.attendees },
              { label: '購入', value: newFunnel.frontendPurchases },
            ]}
          />
          <SegmentFunnelCard
            title="既存ファネル"
            meta="配信開始時の既存LINEを母数として固定"
            entryValue={launch.fixedExistingAudience}
            entryLabel="既存LINE対象"
            stages={[
              { label: '動画閲覧', value: existingFunnel.videoViews },
              { label: 'セミナー申込', value: existingFunnel.applications, target: launch.targets.existingApplications },
              { label: 'セミナー参加', value: existingFunnel.attendees },
              { label: '購入', value: existingFunnel.frontendPurchases },
            ]}
          />
        </div>
      </section>

      <section className={dashboardCardClass}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">バックエンドは補足指標</p>
            <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">この画面の主指標はFE購入20人・FE売上200万円です。</p>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
            <Metric label="BE購入" value={`${launch.backendPurchases} / ${launch.targets.backendPurchases}人`} />
            <Metric label="BE売上" value={compactYen(metrics.backendRevenue)} />
            <Metric label="BE売上目標" value={compactYen(launch.targets.backendPurchases * launch.targets.backendUnitPrice)} />
            <Metric label="FE+BE実績" value={compactYen(metrics.revenue)} />
          </div>
        </div>
      </section>

    </div>
  );
}

function NumberField({ label, value, onChange, suffix = '人', disabled = false }: { label: string; value: number; onChange: (value: number) => void; suffix?: string; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-[color:var(--color-text-secondary)]">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="number"
          min={0}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
          className="min-w-0 flex-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-2 text-right font-semibold tabular-nums text-[color:var(--color-text-primary)] disabled:cursor-not-allowed disabled:bg-[color:var(--color-surface-muted)] disabled:text-[color:var(--color-text-muted)]"
        />
        <span className="w-8 text-xs text-[color:var(--color-text-muted)]">{suffix}</span>
      </div>
    </label>
  );
}

function SmallNumberInput({ value, onChange, disabled = false }: { value: number | null; onChange: (value: number) => void; disabled?: boolean }) {
  return (
    <input
      type="number"
      min={0}
      value={value ?? ''}
      placeholder="—"
      disabled={disabled}
      onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
      className="w-20 rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-2 py-1.5 text-right text-sm tabular-nums disabled:bg-transparent"
    />
  );
}

function SeptemberInput({
  launch,
  update,
  save,
  saving,
  dirty,
  message,
  lstepConnected,
}: {
  launch: LimitedLaunchKpi;
  update: (updater: (current: LimitedLaunchKpi) => LimitedLaunchKpi) => void;
  save: () => void;
  saving: boolean;
  dirty: boolean;
  message: string | null;
  lstepConnected: boolean;
}) {
  const metrics = useMemo(() => launchMetrics(launch), [launch]);
  const setTarget = (key: keyof LimitedLaunchKpi['targets'], value: number) => update((current) => ({
    ...current,
    targets: { ...current.targets, [key]: value },
  }));

  return (
    <div className="section-stack">
      <div className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3 shadow-[var(--shadow-soft)]">
        <div>
          <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">目標・実績入力</p>
          <p className="mt-0.5 text-xs text-[color:var(--color-text-muted)]">新規LINEとセミナー申込は、最新LSTEP CSVから自動更新します。</p>
        </div>
        <div className="flex items-center gap-3">
          {message ? <span className={`text-xs ${message.includes('保存しました') ? 'text-[color:var(--color-accent)]' : 'text-red-600'}`}>{message}</span> : null}
          <button type="button" onClick={save} disabled={!dirty || saving} className="rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            {saving ? '保存中…' : '変更を保存'}
          </button>
        </div>
      </div>

      <section className={dashboardCardClass}>
        <SectionHeading title="集計条件とCSVスナップショット" description="既存母数は8/28 21:00時点の1,450人で固定します。" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="固定した既存母数" value={launch.fixedExistingAudience} onChange={() => undefined} disabled />
          <NumberField label="現在配信可能" value={launch.reachableExistingAudience} onChange={(value) => update((current) => ({ ...current, reachableExistingAudience: value }))} />
          <NumberField label="新規LINE累計" value={metrics.newRegistrations} onChange={() => undefined} disabled />
          <label className="block">
            <span className="text-xs font-semibold text-[color:var(--color-text-secondary)]">CSV実績日</span>
            <input type="date" value={launch.snapshotDate} disabled={lstepConnected} onChange={(event) => update((current) => ({ ...current, snapshotDate: event.target.value }))} className="mt-1.5 w-full rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-background)] px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:bg-[color:var(--color-surface-muted)] disabled:text-[color:var(--color-text-muted)]" />
          </label>
        </div>
        <div className="mt-4 rounded-lg bg-[color:var(--color-surface-muted)] px-4 py-3 text-xs text-[color:var(--color-text-secondary)]">
          自動計算: ブロック {metrics.blocked}人 / ブロック率 {pct(percent(metrics.blocked, launch.fixedExistingAudience))}
        </div>
      </section>

      <section className={dashboardCardClass}>
        <SectionHeading title="全体KPI" />
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="FE+BE売上目標" value={launch.targets.revenue} onChange={(value) => setTarget('revenue', value)} suffix="円" />
          <NumberField label="既存LINE計画値" value={launch.targets.plannedExistingAudience} onChange={(value) => setTarget('plannedExistingAudience', value)} />
          <NumberField label="新規LINE目標" value={launch.targets.newRegistrations} onChange={(value) => setTarget('newRegistrations', value)} />
          <NumberField label="セミナー申込目標" value={launch.targets.applications} onChange={(value) => setTarget('applications', value)} />
          <NumberField label="セミナー参加目標" value={launch.targets.attendees} onChange={(value) => setTarget('attendees', value)} />
          <NumberField label="参加率目標" value={launch.targets.attendanceRate} onChange={(value) => setTarget('attendanceRate', value)} suffix="%" />
          <NumberField label="FE購入目標" value={launch.targets.frontendPurchases} onChange={(value) => setTarget('frontendPurchases', value)} />
          <NumberField label="FE単価" value={launch.targets.frontendUnitPrice} onChange={(value) => setTarget('frontendUnitPrice', value)} suffix="円" />
          <NumberField label="参加→FE目標" value={launch.targets.attendeeToFrontendRate} onChange={(value) => setTarget('attendeeToFrontendRate', value)} suffix="%" />
          <NumberField label="BE購入目標" value={launch.targets.backendPurchases} onChange={(value) => setTarget('backendPurchases', value)} />
          <NumberField label="BE単価" value={launch.targets.backendUnitPrice} onChange={(value) => setTarget('backendUnitPrice', value)} suffix="円" />
          <NumberField label="FE→BE目標" value={launch.targets.frontendToBackendRate} onChange={(value) => setTarget('frontendToBackendRate', value)} suffix="%" />
        </div>
        <div className="mt-5 grid gap-4 border-t border-[color:var(--color-border)] pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <NumberField label="既存からの申込目標" value={launch.targets.existingApplications} onChange={(value) => setTarget('existingApplications', value)} />
          <NumberField label="既存申込率目標" value={launch.targets.existingApplicationRate} onChange={(value) => setTarget('existingApplicationRate', value)} suffix="%" />
          <NumberField label="新規からの申込目標" value={launch.targets.newApplications} onChange={(value) => setTarget('newApplications', value)} />
          <NumberField label="新規申込率目標" value={launch.targets.newApplicationRate} onChange={(value) => setTarget('newApplicationRate', value)} suffix="%" />
        </div>
      </section>

      <section className={dashboardCardClass}>
        <SectionHeading title="8/28〜9/7 日別実績" description="CSV取込では、友だち追加日・申込日時・新規既存タグからこの表を更新します。" />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead><tr className="border-b border-[color:var(--color-border)] text-xs text-[color:var(--color-text-muted)]"><th className="px-3 py-2 text-left font-medium">日付</th><th className="px-3 py-2 text-right font-medium">新規LINE登録</th><th className="px-3 py-2 text-right font-medium">既存から申込</th><th className="px-3 py-2 text-right font-medium">新規から申込</th><th className="px-3 py-2 text-right font-medium">申込合計</th></tr></thead>
            <tbody>
              {launch.dailyApplications.map((row, index) => (
                <tr key={row.date} className="border-b border-[color:var(--color-border)] last:border-0">
                  <td className="px-3 py-2.5 font-medium">{dateLabel(row.date, true)}</td>
                  <td className="px-3 py-2.5 text-right"><SmallNumberInput value={row.newRegistrations} disabled={lstepConnected} onChange={(value) => updateDailyRow(update, index, 'newRegistrations', value)} /></td>
                  <td className="px-3 py-2.5 text-right"><SmallNumberInput value={row.existing} disabled={lstepConnected} onChange={(value) => updateDailyRow(update, index, 'existing', value)} /></td>
                  <td className="px-3 py-2.5 text-right"><SmallNumberInput value={row.new} disabled={lstepConnected} onChange={(value) => updateDailyRow(update, index, 'new', value)} /></td>
                  <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{row.existing === null && row.new === null ? '—' : (row.existing ?? 0) + (row.new ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={dashboardCardClass}>
        <SectionHeading title="セミナー日程別の実績" description="申込はCSV、参加・FE購入は確定実績を入力します。" />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead><tr className="border-b border-[color:var(--color-border)] text-xs text-[color:var(--color-text-muted)]"><th className="px-3 py-2 text-left font-medium">開催日</th><th className="px-3 py-2 text-right font-medium">申込目標</th><th className="px-3 py-2 text-right font-medium">申込実績</th><th className="px-3 py-2 text-right font-medium">参加目標</th><th className="px-3 py-2 text-right font-medium">参加実績</th><th className="px-3 py-2 text-right font-medium">FE目標</th><th className="px-3 py-2 text-right font-medium">FE購入</th></tr></thead>
            <tbody>
              {launch.eventDays.map((row, index) => (
                <tr key={row.date} className={`border-b border-[color:var(--color-border)] last:border-0 ${row.isOff ? 'bg-[color:var(--color-surface-muted)]' : ''}`}>
                  <td className="px-3 py-2.5 font-medium">{dateLabel(row.date, true)} {row.isOff ? <span className="ml-2 text-xs text-[color:var(--color-text-muted)]">休み</span> : null}</td>
                  <td className="px-3 py-2.5 text-right"><SmallNumberInput value={row.applicationTarget} disabled={row.isOff} onChange={(value) => updateEvent(update, index, 'applicationTarget', value)} /></td>
                  <td className="px-3 py-2.5 text-right"><SmallNumberInput value={row.applications} disabled={row.isOff || lstepConnected} onChange={(value) => updateEvent(update, index, 'applications', value)} /></td>
                  <td className="px-3 py-2.5 text-right"><SmallNumberInput value={row.attendanceTarget} disabled={row.isOff} onChange={(value) => updateEvent(update, index, 'attendanceTarget', value)} /></td>
                  <td className="px-3 py-2.5 text-right"><SmallNumberInput value={row.attendees} disabled={row.isOff} onChange={(value) => updateEvent(update, index, 'attendees', value)} /></td>
                  <td className="px-3 py-2.5 text-right"><SmallNumberInput value={row.frontendTarget} disabled={row.isOff} onChange={(value) => updateEvent(update, index, 'frontendTarget', value)} /></td>
                  <td className="px-3 py-2.5 text-right"><SmallNumberInput value={row.frontendPurchases} disabled={row.isOff} onChange={(value) => updateEvent(update, index, 'frontendPurchases', value)} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 max-w-xs border-t border-[color:var(--color-border)] pt-5">
          <NumberField label="BE購入実績" value={launch.backendPurchases} onChange={(value) => update((current) => ({ ...current, backendPurchases: value }))} />
        </div>
      </section>
    </div>
  );
}

function updateDailyRow(
  update: (updater: (current: LimitedLaunchKpi) => LimitedLaunchKpi) => void,
  index: number,
  key: 'newRegistrations' | 'existing' | 'new',
  value: number,
) {
  update((current) => {
    const dailyApplications = current.dailyApplications.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row);
    return {
      ...current,
      newRegistrations: dailyApplications.reduce((sum, row) => sum + (row.newRegistrations ?? 0), 0),
      dailyApplications,
    };
  });
}

function updateEvent(
  update: (updater: (current: LimitedLaunchKpi) => LimitedLaunchKpi) => void,
  index: number,
  key: 'applicationTarget' | 'applications' | 'attendanceTarget' | 'attendees' | 'frontendTarget' | 'frontendPurchases',
  value: number,
) {
  update((current) => ({
    ...current,
    eventDays: current.eventDays.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row),
  }));
}

export function SeptemberLaunchKpi({ funnelId, mode }: SeptemberLaunchKpiProps) {
  const { data, error, mutate } = useSWR<KpiResponse>(`/api/launch/kpi/${funnelId}`, fetcher, {
    revalidateOnFocus: false,
  });
  const [draft, setDraft] = useState<LaunchKpi | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const base = draft ?? data?.kpi ?? emptyKpi();
  const launch = useMemo(
    () => applyLstepSnapshot(mergeLimitedLaunch(base.limitedLaunch), data?.lstepSnapshot),
    [base.limitedLaunch, data?.lstepSnapshot],
  );

  const update = useCallback((updater: (current: LimitedLaunchKpi) => LimitedLaunchKpi) => {
    setMessage(null);
    setDraft((currentDraft) => {
      const currentBase = currentDraft ?? structuredClone(data?.kpi ?? emptyKpi());
      const currentLaunch = applyLstepSnapshot(
        mergeLimitedLaunch(currentBase.limitedLaunch),
        data?.lstepSnapshot,
      );
      return { ...currentBase, limitedLaunch: updater(currentLaunch) };
    });
  }, [data?.kpi, data?.lstepSnapshot]);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/launch/kpi/${funnelId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? '保存に失敗しました');
      await mutate({ kpi: draft, isDefault: false, lstepSnapshot: data?.lstepSnapshot }, { revalidate: false });
      setDraft(null);
      setMessage('保存しました');
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [data?.lstepSnapshot, draft, funnelId, mutate]);

  if (mode === 'input') {
    return <SeptemberInput launch={launch} update={update} save={save} saving={saving} dirty={draft !== null} message={message ?? (error ? 'KPI保存先に接続できません' : null)} lstepConnected={Boolean(data?.lstepSnapshot)} />;
  }

  return <SeptemberSummary launch={launch} lstepSnapshot={data?.lstepSnapshot} />;
}
