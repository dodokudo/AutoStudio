'use client';

import { useMemo, useState, useCallback, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { dashboardCardClass } from '@/components/dashboard/styles';
import { FunnelAnalysis } from '@/app/(autostudio)/line/_components/FunnelAnalysis';
import { FunnelComparison } from '@/components/FunnelComparison';
import { PRESET_FUNNEL_3M } from '@/lib/lstep/funnel-types';
import type { FunnelAnalysisResult } from '@/lib/lstep/funnel-types';
import type { LaunchKpi } from '@/types/launch';

// ------- Constants -------

/** 3月8日以降が新規、3月7日以前が既存 */
const SEGMENT_CUTOFF_DATE = '2026-03-08';

// ------- Props -------

interface KpiDashboardProps {
  funnelId: string;
  startDate?: string;
  endDate?: string;
  baseDate?: string;
}

// ------- Fetcher -------

const fetcher = async (url: string): Promise<{ kpi: LaunchKpi; isDefault: boolean }> => {
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
  return `¥${numFmt.format(v)}`;
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
    videoViewers: { target: 0, actual: 0 },
    seminarApplications: { target: 0, actual: 0, existingTarget: 0, existingActual: 0, newTarget: 0, newActual: 0 },
    seminarDays: [],
    frontend: { unitPrice: 0, target: 0, actual: 0 },
    backend: { unitPrice: 0, isVariable: false, target: 0, actual: 0, revenue: 0 },
  };
}

// ------- Color helpers -------

function progressColor(rate: number): string {
  if (rate >= 80) return '#16A34A';
  if (rate >= 50) return '#CA8A04';
  return '#DC2626';
}

function progressBg(rate: number): string {
  if (rate >= 80) return 'rgba(22,163,74,0.15)';
  if (rate >= 50) return 'rgba(202,138,4,0.15)';
  return 'rgba(220,38,38,0.15)';
}

// ------- Chart colors -------

const CHART_COLORS = {
  lineRegistrations: '#6366F1',
  videoViewers: '#8B5CF6',
  seminarApplications: '#F59E0B',
  seminarAttendees: '#10B981',
  frontendPurchases: '#3B82F6',
  backendPurchases: '#EF4444',
} as const;

// ------- Funnel step row type -------

interface FunnelRow {
  label: string;
  target: number;
  actual: number;
  prevTarget: number;
  prevActual: number;
  revenue?: number;
  sub?: string; // sub-label like 既存/新規
  existingActual?: number;
  newActual?: number;
}

// ------- Helper: generate date range -------

function generateDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const d = new Date(start);
  const endD = new Date(end);
  while (d <= endD) {
    dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

function shortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}`;
}

// ------- Segment data types -------

interface StepCount {
  total: number;
  existing: number;
  new: number;
}

interface FriendsCount {
  existing: number;
  new: number;
  total: number;
  steps?: {
    video: StepCount;
    seminarApplied: StepCount;
    seminarJoined: StepCount;
    fePurchased: StepCount;
    bePurchased: StepCount;
  };
}

/** ファネルステップごとの既存/新規到達数マップ (stepId -> { existing, new }) */
interface SegmentStepMap {
  [stepId: string]: { existing: number; new: number };
}

// ------- Component -------

export function KpiDashboard({ funnelId, startDate, endDate, baseDate }: KpiDashboardProps) {
  const { data, error, isLoading } = useSWR(
    `/api/launch/kpi/${funnelId}`,
    fetcher,
  );

  const { mutate } = useSWRConfig();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; message: string } | null>(null);

  // BQからLINE友だち数（既存/新規）を取得
  const [friendsCount, setFriendsCount] = useState<FriendsCount | null>(null);
  // ファネルの既存/新規セグメント別データ
  const [segmentStepMap, setSegmentStepMap] = useState<SegmentStepMap | null>(null);

  useEffect(() => {
    // BQから既存/新規のLINE友だち数を取得
    fetch(`/api/line/friends-count?cutoff=${SEGMENT_CUTOFF_DATE}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setFriendsCount({ existing: data.existing, new: data.new, total: data.total, steps: data.steps });
      })
      .catch(() => { /* サイレント失敗 */ });
  }, []);

  useEffect(() => {
    // 3Mファネルの既存/新規セグメント別データを取得
    const fetchSegments = async () => {
      try {
        const [resExisting, resNew] = await Promise.all([
          fetch('/api/line/funnel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              funnelDefinition: PRESET_FUNNEL_3M,
              segmentFilter: 'existing',
              segmentCutoffDate: SEGMENT_CUTOFF_DATE,
            }),
          }),
          fetch('/api/line/funnel', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              funnelDefinition: PRESET_FUNNEL_3M,
              segmentFilter: 'new',
              segmentCutoffDate: SEGMENT_CUTOFF_DATE,
            }),
          }),
        ]);

        if (!resExisting.ok || !resNew.ok) return;

        const [dataExisting, dataNew] = await Promise.all([
          resExisting.json() as Promise<FunnelAnalysisResult>,
          resNew.json() as Promise<FunnelAnalysisResult>,
        ]);

        const map: SegmentStepMap = {};
        for (const step of dataExisting.steps) {
          map[step.stepId] = { existing: step.reached, new: 0 };
        }
        for (const step of dataNew.steps) {
          if (map[step.stepId]) {
            map[step.stepId].new = step.reached;
          } else {
            map[step.stepId] = { existing: 0, new: step.reached };
          }
        }
        setSegmentStepMap(map);
      } catch {
        /* サイレント失敗 */
      }
    };
    fetchSegments();
  }, []);

  const handleSyncTags = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/launch/kpi/${funnelId}/sync-tags`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setSyncResult({ success: false, message: json.error || '同期に失敗しました' });
        return;
      }
      setSyncResult({
        success: true,
        message: `${json.tagCount}件のタグから実績値を更新しました`,
      });
      // KPIデータを再取得
      mutate(`/api/launch/kpi/${funnelId}`);
    } catch {
      setSyncResult({ success: false, message: '通信エラーが発生しました' });
    } finally {
      setSyncing(false);
    }
  }, [funnelId, mutate]);

  const rawKpi = data?.kpi ?? defaultKpi();
  // 後方互換: 旧データに videoViewers がない場合のフォールバック
  const kpi: LaunchKpi = {
    ...rawKpi,
    videoViewers: rawKpi.videoViewers ?? { target: 0, actual: 0 },
    seminarApplications: rawKpi.seminarApplications ?? { target: 0, actual: 0 },
  };
  const isDefault = data?.isDefault ?? false;

  // BQから取得した実績で上書き（3Mタグデータが信頼できるソース）
  const existingLineActual = friendsCount?.existing ?? kpi.lineRegistration.existing;
  const newLineActual = friendsCount?.new ?? 0;
  const bqSteps = friendsCount?.steps;
  const videoActual = bqSteps?.video.total ?? kpi.videoViewers.actual;
  const seminarAppliedActual = bqSteps?.seminarApplied.total ?? kpi.seminarApplications.actual;
  const seminarJoinedActual = bqSteps?.seminarJoined.total ?? kpi.seminarDays.reduce((s, d) => s + d.attendActual, 0);
  const feActual = bqSteps?.fePurchased.total ?? kpi.frontend.actual;
  const beActual = bqSteps?.bePurchased.total ?? kpi.backend.actual;

  const computed = useMemo(() => {
    const totalNewLineTarget =
      kpi.inflow.threads.target + kpi.inflow.instagram.target + kpi.inflow.ads.target;
    // LINE登録の実績はBQのfriends_countから取得
    const existingLineCount = existingLineActual;
    const newLineCount = newLineActual;
    const totalLineRegTarget = kpi.lineRegistration.existing + totalNewLineTarget;
    const totalLineReg = existingLineCount + newLineCount;

    const seminarAttendTarget = kpi.seminarDays.reduce((sum, d) => sum + d.attendTarget, 0);
    const seminarAttendActual = kpi.seminarDays.reduce((sum, d) => sum + d.attendActual, 0);

    const frontendRevenue = kpi.frontend.unitPrice * feActual;
    const backendRevenue = kpi.backend.unitPrice * beActual;
    const totalRevenue = frontendRevenue + backendRevenue;
    const achievementRate = safeDivide(totalRevenue, kpi.kgi.target) * 100;

    // ファネルステップとsegmentStepMapのマッピング
    // KPIのファネル行 → 3Mファネルのステップ対応
    const stepMapping: Record<string, string> = {
      'LINE登録(既存)': 'base',
      '新規LINE': 'base',
      'LINE登録': 'base',
      '動画閲覧': 'video_lp',
      'セミナー申込': 'seminar_applied',
      'セミナー参加': 'seminar_joined',
      'フロント購入': 'fe_purchased',
      'バックエンド購入': 'be_purchased',
    };

    const getSegmentActuals = (label: string): { existing: number | undefined; new: number | undefined } => {
      if (!segmentStepMap) return { existing: undefined, new: undefined };
      const stepId = stepMapping[label];
      if (!stepId || !segmentStepMap[stepId]) return { existing: undefined, new: undefined };
      return segmentStepMap[stepId];
    };

    // Build funnel rows
    const lineSegment = getSegmentActuals('LINE登録');
    const videoSegment = getSegmentActuals('動画閲覧');
    const seminarAppSegment = getSegmentActuals('セミナー申込');
    const seminarJoinSegment = getSegmentActuals('セミナー参加');
    const feSegment = getSegmentActuals('フロント購入');
    const beSegment = getSegmentActuals('バックエンド購入');

    const rows: FunnelRow[] = [
      {
        label: 'LINE登録(既存)',
        target: kpi.lineRegistration.existing,
        actual: existingLineCount,
        prevTarget: 0,
        prevActual: 0,
        existingActual: existingLineCount,
        newActual: undefined,
      },
      {
        label: '新規LINE',
        target: totalNewLineTarget,
        actual: newLineCount,
        prevTarget: 0,
        prevActual: 0,
        existingActual: undefined,
        newActual: newLineCount,
      },
      {
        label: '動画閲覧',
        target: kpi.videoViewers.target,
        actual: videoActual,
        prevTarget: totalLineRegTarget,
        prevActual: totalLineReg,
        existingActual: bqSteps?.video.existing ?? videoSegment.existing,
        newActual: bqSteps?.video.new ?? videoSegment.new,
      },
      {
        label: 'セミナー申込',
        target: kpi.seminarApplications.target,
        actual: seminarAppliedActual,
        prevTarget: kpi.videoViewers.target,
        prevActual: videoActual,
        existingActual: bqSteps?.seminarApplied.existing ?? seminarAppSegment.existing,
        newActual: bqSteps?.seminarApplied.new ?? seminarAppSegment.new,
      },
      {
        label: 'セミナー参加',
        target: seminarAttendTarget,
        actual: seminarJoinedActual,
        prevTarget: kpi.seminarApplications.target,
        prevActual: seminarAppliedActual,
        existingActual: bqSteps?.seminarJoined.existing ?? seminarJoinSegment.existing,
        newActual: bqSteps?.seminarJoined.new ?? seminarJoinSegment.new,
      },
      {
        label: 'フロント購入',
        target: kpi.frontend.target,
        actual: feActual,
        prevTarget: seminarAttendTarget,
        prevActual: seminarJoinedActual,
        revenue: kpi.frontend.unitPrice * feActual,
        existingActual: bqSteps?.fePurchased.existing ?? feSegment.existing,
        newActual: bqSteps?.fePurchased.new ?? feSegment.new,
      },
      {
        label: 'バックエンド購入',
        target: kpi.backend.target,
        actual: beActual,
        prevTarget: kpi.frontend.target,
        prevActual: feActual,
        revenue: kpi.backend.unitPrice * beActual,
        existingActual: bqSteps?.bePurchased.existing ?? beSegment.existing,
        newActual: bqSteps?.bePurchased.new ?? beSegment.new,
      },
    ];

    // Compute target revenues
    const frontendTargetRevenue = kpi.frontend.unitPrice * kpi.frontend.target;
    const backendTargetRevenue = kpi.backend.isVariable ? 0 : kpi.backend.unitPrice * kpi.backend.target;
    const totalTargetRevenue = frontendTargetRevenue + backendTargetRevenue;

    // Build chart data from dailyMetrics
    const dailyMetrics = kpi.dailyMetrics ?? [];
    const metricsMap = new Map(dailyMetrics.map(m => [m.date, m]));

    // Chart date range: use baseDate as start if available, last seminar day as end
    const lastSeminarDate = kpi.seminarDays.length > 0
      ? kpi.seminarDays.reduce((latest, d) => d.date > latest ? d.date : latest, kpi.seminarDays[0].date)
      : null;
    const chartStart = baseDate || startDate;
    const chartEnd = lastSeminarDate || endDate;

    let chartData: Array<{
      date: string;
      label: string;
      lineRegistrations: number;
      videoViewers: number;
      seminarApplications: number;
      seminarAttendees: number;
      frontendPurchases: number;
      backendPurchases: number;
    }> = [];

    if (chartStart && chartEnd) {
      const dates = generateDateRange(chartStart, chartEnd);
      let cumLine = 0, cumBenefit = 0, cumSemApp = 0, cumSemAtt = 0, cumFe = 0, cumBe = 0;

      chartData = dates.map(date => {
        const m = metricsMap.get(date);
        if (m) {
          cumLine += m.lineRegistrations ?? 0;
          cumBenefit += m.videoViewers ?? 0;
          cumSemApp += m.seminarApplications ?? 0;
          cumSemAtt += m.seminarAttendees ?? 0;
          cumFe += m.frontendPurchases ?? 0;
          cumBe += m.backendPurchases ?? 0;
        }
        return {
          date,
          label: shortDate(date),
          lineRegistrations: cumLine,
          videoViewers: cumBenefit,
          seminarApplications: cumSemApp,
          seminarAttendees: cumSemAtt,
          frontendPurchases: cumFe,
          backendPurchases: cumBe,
        };
      });
    }

    const hasChartData = dailyMetrics.length > 0;

    return {
      totalRevenue,
      frontendRevenue,
      backendRevenue,
      frontendTargetRevenue,
      backendTargetRevenue,
      totalTargetRevenue,
      achievementRate,
      rows,
      chartData,
      hasChartData,
      totalLineRegTarget,
      totalLineReg,
      seminarAttendTarget,
    };
  }, [kpi, startDate, endDate, baseDate, existingLineActual, newLineActual, segmentStepMap]);

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
        データ取得に失敗しました
      </div>
    );
  }

  // ------- Render -------

  return (
    <div className="flex flex-col gap-6">
      {/* Header: status + sync button */}
      <div className="flex items-center justify-between gap-4">
        {isDefault ? (
          <div className="flex-1 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-[color:var(--color-text-secondary)]">
            KPIが未設定です。KPI設定タブから入力してください。
          </div>
        ) : (
          <div className="flex-1" />
        )}
        <button
          onClick={handleSyncTags}
          disabled={syncing || isDefault}
          className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs font-medium text-[color:var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-muted)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            className={syncing ? 'animate-spin' : ''}
          >
            <path
              d="M21 12a9 9 0 1 1-2.636-6.364"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M21 3v6h-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {syncing ? '同期中...' : 'Lstep同期'}
        </button>
      </div>

      {syncResult && (
        <div
          className={`rounded-lg border px-4 py-2 text-xs ${
            syncResult.success
              ? 'border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400'
              : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400'
          }`}
        >
          {syncResult.message}
        </div>
      )}

      {/* KGI Summary */}
      <div className={dashboardCardClass}>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <p className="text-xs font-medium text-[color:var(--color-text-muted)]">売上目標 (KGI)</p>
            <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
              {yen(kpi.kgi.target)}
            </p>
            {computed.totalTargetRevenue > 0 && computed.totalTargetRevenue !== kpi.kgi.target && (
              <p className="text-[10px] text-[color:var(--color-text-muted)]">
                FE+BE目標: {yen(computed.totalTargetRevenue)}
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-[color:var(--color-text-muted)]">実績売上</p>
            <p className="mt-1 text-2xl font-bold text-[color:var(--color-accent)]">
              {yen(computed.totalRevenue)}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 w-full max-w-[120px] overflow-hidden rounded-full bg-[var(--color-surface-muted)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(computed.achievementRate, 100)}%`,
                    backgroundColor: progressColor(computed.achievementRate),
                  }}
                />
              </div>
              <span className="text-xs font-medium text-[color:var(--color-text-secondary)]">
                {pct(computed.achievementRate)}
              </span>
            </div>
          </div>
          <div>
            <p className="text-xs text-[color:var(--color-text-muted)]">FE目標売上</p>
            <p className="mt-1 text-lg font-bold text-[color:var(--color-text-secondary)]">
              {yen(computed.frontendTargetRevenue)}
            </p>
            <p className="text-[10px] text-[color:var(--color-text-muted)]">
              {kpi.frontend.unitPrice > 0 ? `${yen(kpi.frontend.unitPrice)} x ${kpi.frontend.target}人` : ''}
            </p>
          </div>
          <div>
            <p className="text-xs text-[color:var(--color-text-muted)]">FE実績売上</p>
            <p className="mt-1 text-lg font-bold text-[color:var(--color-text-primary)]">
              {yen(computed.frontendRevenue)}
            </p>
            <p className="text-[10px] text-[color:var(--color-text-muted)]">
              {kpi.frontend.unitPrice > 0 ? `${yen(kpi.frontend.unitPrice)} x ${kpi.frontend.actual}人` : ''}
            </p>
          </div>
          <div>
            <p className="text-xs text-[color:var(--color-text-muted)]">BE目標売上</p>
            <p className="mt-1 text-lg font-bold text-[color:var(--color-text-secondary)]">
              {yen(computed.backendTargetRevenue)}
            </p>
            <p className="text-[10px] text-[color:var(--color-text-muted)]">
              {kpi.backend.unitPrice > 0 ? `${yen(kpi.backend.unitPrice)} x ${kpi.backend.target}人` : ''}
            </p>
          </div>
          <div>
            <p className="text-xs text-[color:var(--color-text-muted)]">BE実績売上</p>
            <p className="mt-1 text-lg font-bold text-[color:var(--color-text-primary)]">
              {yen(computed.backendRevenue)}
            </p>
            <p className="text-[10px] text-[color:var(--color-text-muted)]">
              {kpi.backend.unitPrice > 0 ? `${yen(kpi.backend.unitPrice)} x ${kpi.backend.actual}人` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Funnel step cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-7">
        {computed.rows.map((row) => {
          const achieveRate = safeDivide(row.actual, row.target) * 100;
          const remaining = Math.max(row.target - row.actual, 0);
          const achieved = row.target > 0 && row.actual >= row.target;

          return (
            <div key={row.label} className={dashboardCardClass}>
              <p className="text-xs font-semibold text-[color:var(--color-text-primary)]">{row.label}</p>
              {row.target > 0 && (
                <p className="mt-0.5 text-[10px] text-[color:var(--color-text-muted)]">
                  目標 {numFmt.format(row.target)}人
                </p>
              )}
              <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
                {numFmt.format(row.actual)}<span className="text-sm font-normal">人</span>
              </p>
              {row.target > 0 && (
                <>
                  <p className="mt-0.5 text-[10px] text-[color:var(--color-text-secondary)]">
                    {achieved
                      ? <span className="font-semibold text-[#16A34A]">達成</span>
                      : `残り ${numFmt.format(remaining)}人`}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: progressBg(achieveRate) }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(achieveRate, 100)}%`,
                          backgroundColor: progressColor(achieveRate),
                        }}
                      />
                    </div>
                    <span
                      className="shrink-0 text-[10px] font-bold"
                      style={{ color: progressColor(achieveRate) }}
                    >
                      {pct(achieveRate)}
                    </span>
                  </div>
                </>
              )}
              {row.sub && (
                <p className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">{row.sub}</p>
              )}
              {row.revenue !== undefined && row.revenue > 0 && (
                <p className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">
                  売上 {yen(row.revenue)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Seminar Daily Breakdown (moved above chart) */}
      {kpi.seminarDays.length > 0 && (
        <div className={dashboardCardClass}>
          <p className="mb-4 text-sm font-semibold text-[color:var(--color-text-primary)]">セミナー日別</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-xs text-[color:var(--color-text-muted)]">
                  <th className="pb-3 pr-4 text-left font-medium">日付</th>
                  <th className="pb-3 pr-4 text-right font-medium">集客目標</th>
                  <th className="pb-3 pr-4 text-right font-medium">集客実績</th>
                  <th className="pb-3 pr-4 text-right font-medium">集客率</th>
                  <th className="pb-3 pr-4 text-right font-medium">参加目標</th>
                  <th className="pb-3 pr-4 text-right font-medium">参加実績</th>
                  <th className="pb-3 pr-4 text-right font-medium">参加率</th>
                  <th className="pb-3 pr-4 text-right font-medium">購入目標</th>
                  <th className="pb-3 pr-4 text-right font-medium">購入数</th>
                  <th className="pb-3 text-right font-medium">購入率</th>
                </tr>
              </thead>
              <tbody>
                {kpi.seminarDays.map((day) => {
                  const recruitRate = safeDivide(day.recruitActual ?? 0, day.recruitTarget) * 100;
                  const attendRate = safeDivide(day.attendActual, day.attendTarget) * 100;
                  const purchaseRate = safeDivide(day.purchaseCount, day.purchaseTarget ?? 0) * 100;
                  return (
                    <tr
                      key={day.date}
                      className="border-b border-[color:var(--color-border)] last:border-0"
                    >
                      <td className="py-3 pr-4 font-medium text-[color:var(--color-text-primary)]">
                        {day.date}
                      </td>
                      <td className="py-3 pr-4 text-right text-[color:var(--color-text-secondary)]">
                        {numFmt.format(day.recruitTarget)}
                      </td>
                      <td className="py-3 pr-4 text-right font-bold text-[color:var(--color-text-primary)]">
                        {numFmt.format(day.recruitActual ?? 0)}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span
                          className="font-semibold"
                          style={{ color: day.recruitTarget === 0 ? undefined : progressColor(recruitRate) }}
                        >
                          {day.recruitTarget === 0 ? '-' : pct(recruitRate)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right text-[color:var(--color-text-secondary)]">
                        {numFmt.format(day.attendTarget)}
                      </td>
                      <td className="py-3 pr-4 text-right font-bold text-[color:var(--color-text-primary)]">
                        {numFmt.format(day.attendActual)}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        <span
                          className="font-semibold"
                          style={{ color: day.attendTarget === 0 ? undefined : progressColor(attendRate) }}
                        >
                          {day.attendTarget === 0 ? '-' : pct(attendRate)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-right text-[color:var(--color-text-secondary)]">
                        {numFmt.format(day.purchaseTarget ?? 0)}
                      </td>
                      <td className="py-3 pr-4 text-right font-bold text-[color:var(--color-text-primary)]">
                        {numFmt.format(day.purchaseCount)}
                      </td>
                      <td className="py-3 text-right">
                        <span
                          className="font-semibold"
                          style={{ color: (day.purchaseTarget ?? 0) === 0 ? undefined : progressColor(purchaseRate) }}
                        >
                          {(day.purchaseTarget ?? 0) === 0 ? '-' : pct(purchaseRate)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[color:var(--color-border)] font-semibold">
                  <td className="pt-3 pr-4 text-[color:var(--color-text-primary)]">合計</td>
                  <td className="pt-3 pr-4 text-right text-[color:var(--color-text-secondary)]">
                    {numFmt.format(kpi.seminarDays.reduce((s, d) => s + d.recruitTarget, 0))}
                  </td>
                  <td className="pt-3 pr-4 text-right text-[color:var(--color-text-primary)]">
                    {numFmt.format(kpi.seminarDays.reduce((s, d) => s + (d.recruitActual ?? 0), 0))}
                  </td>
                  <td className="pt-3 pr-4 text-right">
                    {(() => {
                      const t = kpi.seminarDays.reduce((s, d) => s + d.recruitTarget, 0);
                      const a = kpi.seminarDays.reduce((s, d) => s + (d.recruitActual ?? 0), 0);
                      const r = safeDivide(a, t) * 100;
                      return <span style={{ color: t === 0 ? undefined : progressColor(r) }}>{t === 0 ? '-' : pct(r)}</span>;
                    })()}
                  </td>
                  <td className="pt-3 pr-4 text-right text-[color:var(--color-text-secondary)]">
                    {numFmt.format(kpi.seminarDays.reduce((s, d) => s + d.attendTarget, 0))}
                  </td>
                  <td className="pt-3 pr-4 text-right text-[color:var(--color-text-primary)]">
                    {numFmt.format(kpi.seminarDays.reduce((s, d) => s + d.attendActual, 0))}
                  </td>
                  <td className="pt-3 pr-4 text-right">
                    {(() => {
                      const t = kpi.seminarDays.reduce((s, d) => s + d.attendTarget, 0);
                      const a = kpi.seminarDays.reduce((s, d) => s + d.attendActual, 0);
                      const r = safeDivide(a, t) * 100;
                      return <span style={{ color: t === 0 ? undefined : progressColor(r) }}>{t === 0 ? '-' : pct(r)}</span>;
                    })()}
                  </td>
                  <td className="pt-3 pr-4 text-right text-[color:var(--color-text-secondary)]">
                    {numFmt.format(kpi.seminarDays.reduce((s, d) => s + (d.purchaseTarget ?? 0), 0))}
                  </td>
                  <td className="pt-3 pr-4 text-right text-[color:var(--color-text-primary)]">
                    {numFmt.format(kpi.seminarDays.reduce((s, d) => s + d.purchaseCount, 0))}
                  </td>
                  <td className="pt-3 text-right">
                    {(() => {
                      const t = kpi.seminarDays.reduce((s, d) => s + (d.purchaseTarget ?? 0), 0);
                      const p = kpi.seminarDays.reduce((s, d) => s + d.purchaseCount, 0);
                      const r = safeDivide(p, t) * 100;
                      return <span style={{ color: t === 0 ? undefined : progressColor(r) }}>{t === 0 ? '-' : pct(r)}</span>;
                    })()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Funnel Progress Table */}
      <div className={dashboardCardClass}>
        <p className="mb-4 text-sm font-semibold text-[color:var(--color-text-primary)]">ファネル進捗</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-xs text-[color:var(--color-text-muted)]">
                <th className="pb-3 pr-4 text-left font-medium">#</th>
                <th className="pb-3 pr-4 text-left font-medium">ステップ</th>
                <th className="pb-3 pr-4 text-right font-medium">目標</th>
                <th className="pb-3 pr-4 text-right font-medium">実績(全体)</th>
                <th className="pb-3 pr-4 text-right font-medium text-blue-600">既存</th>
                <th className="pb-3 pr-4 text-right font-medium text-emerald-600">新規</th>
                <th className="pb-3 pr-4 text-right font-medium">達成率</th>
                <th className="pb-3 text-left font-medium" style={{ minWidth: 100 }}>進捗</th>
              </tr>
            </thead>
            <tbody>
              {computed.rows.map((row, i) => {
                const achieveRate = safeDivide(row.actual, row.target) * 100;
                const remaining = Math.max(row.target - row.actual, 0);
                const achieved = row.target > 0 && row.actual >= row.target;

                return (
                  <tr
                    key={row.label}
                    className="border-b border-[color:var(--color-border)] last:border-0"
                  >
                    <td className="py-3 pr-4 text-xs text-[color:var(--color-text-muted)]">{i}</td>
                    <td className="py-3 pr-4 text-[color:var(--color-text-primary)]">
                      <span className="font-medium">{row.label}</span>
                    </td>
                    <td className="py-3 pr-4 text-right text-[color:var(--color-text-secondary)]">
                      {row.target > 0 ? numFmt.format(row.target) : '-'}
                    </td>
                    <td className="py-3 pr-4 text-right font-bold text-[color:var(--color-text-primary)]">
                      {numFmt.format(row.actual)}
                    </td>
                    <td className="py-3 pr-4 text-right text-blue-600">
                      {row.existingActual !== undefined ? numFmt.format(row.existingActual) : '-'}
                    </td>
                    <td className="py-3 pr-4 text-right text-emerald-600">
                      {row.newActual !== undefined ? numFmt.format(row.newActual) : '-'}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {row.target === 0 ? (
                        <span className="text-[color:var(--color-text-muted)]">-</span>
                      ) : achieved ? (
                        <span className="font-semibold text-[#16A34A]">達成</span>
                      ) : (
                        <span
                          className="font-semibold"
                          style={{ color: progressColor(achieveRate) }}
                        >
                          {pct(achieveRate)}
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      {row.target > 0 && (
                        <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: progressBg(achieveRate) }}>
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(achieveRate, 100)}%`,
                              backgroundColor: progressColor(achieveRate),
                            }}
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3M Funnel Analysis (from BigQuery tags) */}
      {startDate && <FunnelAnalysisSection startDate={startDate} />}

      {/* Existing vs New LINE Comparison */}
      {startDate && (
        <FunnelComparison
          funnelDefinition={PRESET_FUNNEL_3M}
          cutoffDate={SEGMENT_CUTOFF_DATE}
          autoFetch
        />
      )}

      {/* Time-series Chart */}
      {startDate && endDate && (
        <div className={dashboardCardClass}>
          <p className="mb-4 text-sm font-semibold text-[color:var(--color-text-primary)]">
            ローンチ推移（累積）
          </p>
          {computed.hasChartData ? (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={computed.chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  iconType="circle"
                  iconSize={8}
                />
                {/* Target reference lines */}
                {computed.totalLineRegTarget > 0 && (
                  <ReferenceLine
                    y={computed.totalLineRegTarget}
                    stroke={CHART_COLORS.lineRegistrations}
                    strokeDasharray="4 4"
                    strokeOpacity={0.4}
                  />
                )}
                {kpi.seminarApplications.target > 0 && (
                  <ReferenceLine
                    y={kpi.seminarApplications.target}
                    stroke={CHART_COLORS.seminarApplications}
                    strokeDasharray="4 4"
                    strokeOpacity={0.4}
                  />
                )}
                {kpi.frontend.target > 0 && (
                  <ReferenceLine
                    y={kpi.frontend.target}
                    stroke={CHART_COLORS.frontendPurchases}
                    strokeDasharray="4 4"
                    strokeOpacity={0.4}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="lineRegistrations"
                  name="LINE登録"
                  stroke={CHART_COLORS.lineRegistrations}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="videoViewers"
                  name="動画閲覧"
                  stroke={CHART_COLORS.videoViewers}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="seminarApplications"
                  name="セミナー申込"
                  stroke={CHART_COLORS.seminarApplications}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="seminarAttendees"
                  name="セミナー参加"
                  stroke={CHART_COLORS.seminarAttendees}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="frontendPurchases"
                  name="FE購入"
                  stroke={CHART_COLORS.frontendPurchases}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="backendPurchases"
                  name="BE購入"
                  stroke={CHART_COLORS.backendPurchases}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-3 rounded-full bg-[var(--color-surface-muted)] p-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[color:var(--color-text-muted)]">
                  <path d="M3 3v18h18M7 16l4-4 4 4 4-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-sm text-[color:var(--color-text-muted)]">日別データが未入力です</p>
              <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                KPI設定タブの日別メトリクスを入力するとグラフが表示されます
              </p>
              {/* Show chart skeleton with just target reference lines */}
              <div className="mt-4 w-full">
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={computed.chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                      tickLine={false}
                      interval={1}
                    />
                    <YAxis hide />
                    {computed.totalLineRegTarget > 0 && (
                      <ReferenceLine
                        y={computed.totalLineRegTarget}
                        stroke={CHART_COLORS.lineRegistrations}
                        strokeDasharray="4 4"
                        strokeOpacity={0.3}
                        label={{ value: `LINE ${numFmt.format(computed.totalLineRegTarget)}`, fontSize: 10, fill: CHART_COLORS.lineRegistrations }}
                      />
                    )}
                    {kpi.seminarApplications.target > 0 && (
                      <ReferenceLine
                        y={kpi.seminarApplications.target}
                        stroke={CHART_COLORS.seminarApplications}
                        strokeDasharray="4 4"
                        strokeOpacity={0.3}
                        label={{ value: `申込 ${numFmt.format(kpi.seminarApplications.target)}`, fontSize: 10, fill: CHART_COLORS.seminarApplications }}
                      />
                    )}
                    {kpi.frontend.target > 0 && (
                      <ReferenceLine
                        y={kpi.frontend.target}
                        stroke={CHART_COLORS.frontendPurchases}
                        strokeDasharray="4 4"
                        strokeOpacity={0.3}
                        label={{ value: `FE ${numFmt.format(kpi.frontend.target)}`, fontSize: 10, fill: CHART_COLORS.frontendPurchases }}
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// --- Sub-component: 3M Funnel Analysis ---

function FunnelAnalysisSection({ startDate }: { startDate: string }) {
  const [result, setResult] = useState<FunnelAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/line/funnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funnelDefinition: PRESET_FUNNEL_3M }),
      });
      if (!res.ok) throw new Error('ファネルデータの取得に失敗しました');
      const data = await res.json() as FunnelAnalysisResult;
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!result && !loading) {
      fetchData();
    }
  }, [result, loading, fetchData]);

  if (error) {
    return (
      <p className="text-sm text-[color:var(--color-danger)]">ファネル分析エラー: {error}</p>
    );
  }

  if (loading || !result) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-[color:var(--color-text-muted)]">
        ファネル分析を読み込み中...
      </div>
    );
  }

  return <FunnelAnalysis data={result} />;
}
