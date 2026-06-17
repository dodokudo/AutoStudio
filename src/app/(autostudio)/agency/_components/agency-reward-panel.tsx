'use client';

import { useEffect, useMemo, useState } from 'react';

import { Card } from '@/components/ui/card';
import { classNames } from '@/lib/classNames';

type RewardMode = 'performance' | 'list';

type AgencyRewardRow = {
  agency: string;
  registrations: number;
  surveyResponses: number;
  blockedWithin7Days: number;
  purchases: number;
  purchasesWithin30Days: number;
  qualifiedListRewards: number;
};

type CalculatedRewardRow = AgencyRewardRow & {
  mode: RewardMode;
  performanceRewardUnit: number;
  revenue: number;
  payout: number;
  roas: number | null;
  profit: number;
  profitRate: number | null;
};

type RewardMetricTone = 'up' | 'down' | 'neutral';

const STORAGE_KEY = 'autostudio:agency-reward-settings:v1';
const LIST_REWARD_UNIT_YEN = 500;
const PERFORMANCE_REWARD_UNIT_YEN = 20000;
const PURCHASE_REVENUE_UNIT_YEN = 100000;

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value);
}

function formatYen(value: number): string {
  return `${formatNumber(Math.round(value))}円`;
}

function formatRate(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return `${(value * 100).toFixed(1)}%`;
}

function formatRoas(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  return `${value.toFixed(2)}x`;
}

function formatDelta(value: number, formatter: (value: number) => string): string {
  if (value === 0) return '変化なし';
  return `${value > 0 ? '+' : ''}${formatter(value)}`;
}

function loadSettings(): { modes: Record<string, RewardMode>; performanceRewardUnits: Record<string, number> } {
  if (typeof window === 'undefined') return { modes: {}, performanceRewardUnits: {} };

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { modes: {}, performanceRewardUnits: {} };
    const parsed = JSON.parse(raw) as {
      modes?: Record<string, RewardMode>;
      performanceRewardUnits?: Record<string, number>;
      purchaseRewardUnit?: number;
    };
    return {
      modes: parsed.modes ?? {},
      performanceRewardUnits: parsed.performanceRewardUnits ?? {},
    };
  } catch {
    return { modes: {}, performanceRewardUnits: {} };
  }
}

const toneTextClass: Record<RewardMetricTone, string> = {
  up: 'text-[#137a4c]',
  down: 'text-[#b42318]',
  neutral: 'text-[color:var(--color-text-muted)]',
};

const toneBadgeClass: Record<RewardMetricTone, string> = {
  up: 'bg-[#e6f7ed] text-[#096c3e]',
  down: 'bg-[#fdeded] text-[#a61b1b]',
  neutral: 'bg-[#f2f4f7] text-[color:var(--color-text-muted)]',
};

function resolveDeltaTone(value: number | null, inverse = false): RewardMetricTone | undefined {
  if (value === null) return undefined;
  if (value === 0) return 'neutral';
  const isUp = value > 0;
  return inverse ? (isUp ? 'down' : 'up') : isUp ? 'up' : 'down';
}

export function AgencyRewardPanel({
  rows,
  previousRows = [],
  title = '実績概要',
  note,
  showTable = true,
}: {
  rows: AgencyRewardRow[];
  previousRows?: AgencyRewardRow[];
  title?: string;
  note?: string;
  showTable?: boolean;
}) {
  const [modes, setModes] = useState<Record<string, RewardMode>>({});
  const [performanceRewardUnits, setPerformanceRewardUnits] = useState<Record<string, number>>({});
  const [settingsReady, setSettingsReady] = useState(false);

  useEffect(() => {
    const settings = loadSettings();
    setModes(settings.modes);
    setPerformanceRewardUnits(settings.performanceRewardUnits);
    setSettingsReady(true);
  }, []);

  useEffect(() => {
    if (!settingsReady) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ modes, performanceRewardUnits }));
  }, [modes, performanceRewardUnits, settingsReady]);

  const calculateRows = (targetRows: AgencyRewardRow[]): CalculatedRewardRow[] => {
    return targetRows.map((row) => {
      const mode = modes[row.agency] ?? 'list';
      const performanceRewardUnit = performanceRewardUnits[row.agency] ?? PERFORMANCE_REWARD_UNIT_YEN;
      const revenue = row.purchasesWithin30Days * PURCHASE_REVENUE_UNIT_YEN;
      const payout =
        mode === 'list'
          ? row.qualifiedListRewards * LIST_REWARD_UNIT_YEN
          : row.purchasesWithin30Days * performanceRewardUnit;
      const profit = revenue - payout;
      return {
        ...row,
        mode,
        performanceRewardUnit,
        revenue,
        payout,
        roas: payout > 0 ? revenue / payout : null,
        profit,
        profitRate: revenue > 0 ? profit / revenue : null,
      };
    });
  };

  const calculatedRows = useMemo<CalculatedRewardRow[]>(() => calculateRows(rows), [modes, performanceRewardUnits, rows]);
  const previousCalculatedRows = useMemo<CalculatedRewardRow[]>(() => calculateRows(previousRows), [modes, performanceRewardUnits, previousRows]);

  const summarize = (targetRows: CalculatedRewardRow[]) => targetRows.reduce(
    (sum, row) => ({
      revenue: sum.revenue + row.revenue,
      payout: sum.payout + row.payout,
      profit: sum.profit + row.profit,
      qualifiedListRewards: sum.qualifiedListRewards + row.qualifiedListRewards,
      purchasesWithin30Days: sum.purchasesWithin30Days + row.purchasesWithin30Days,
      registrations: sum.registrations + row.registrations,
      blockedWithin7Days: sum.blockedWithin7Days + row.blockedWithin7Days,
      surveyResponses: sum.surveyResponses + row.surveyResponses,
    }),
    {
      revenue: 0,
      payout: 0,
      profit: 0,
      qualifiedListRewards: 0,
      purchasesWithin30Days: 0,
      registrations: 0,
      blockedWithin7Days: 0,
      surveyResponses: 0,
    },
  );

  const totals = summarize(calculatedRows);
  const previousTotals = previousCalculatedRows.length ? summarize(previousCalculatedRows) : null;
  const totalRoas = totals.payout > 0 ? totals.revenue / totals.payout : null;
  const totalProfitRate = totals.revenue > 0 ? totals.profit / totals.revenue : null;
  const previousRoas = previousTotals && previousTotals.payout > 0 ? previousTotals.revenue / previousTotals.payout : null;
  const previousProfitRate = previousTotals && previousTotals.revenue > 0 ? previousTotals.profit / previousTotals.revenue : null;

  const metrics = [
    {
      label: '代理店売上',
      value: formatYen(totals.revenue),
      delta: previousTotals ? formatDelta(totals.revenue - previousTotals.revenue, formatYen) : undefined,
      deltaTone: previousTotals ? resolveDeltaTone(totals.revenue - previousTotals.revenue) : undefined,
    },
    {
      label: '代理店報酬',
      value: formatYen(totals.payout),
      delta: previousTotals ? formatDelta(totals.payout - previousTotals.payout, formatYen) : undefined,
      deltaTone: previousTotals ? resolveDeltaTone(totals.payout - previousTotals.payout, true) : undefined,
    },
    {
      label: 'ROAS',
      value: formatRoas(totalRoas),
      delta: previousRoas !== null && totalRoas !== null ? formatDelta(totalRoas - previousRoas, (value) => `${value.toFixed(2)}x`) : undefined,
      deltaTone: previousRoas !== null && totalRoas !== null ? resolveDeltaTone(totalRoas - previousRoas) : undefined,
    },
    {
      label: '利益額',
      value: formatYen(totals.profit),
      delta: previousTotals ? formatDelta(totals.profit - previousTotals.profit, formatYen) : undefined,
      deltaTone: previousTotals ? resolveDeltaTone(totals.profit - previousTotals.profit) : undefined,
    },
    {
      label: '利益率',
      value: formatRate(totalProfitRate),
      delta:
        previousProfitRate !== null && totalProfitRate !== null
          ? formatDelta((totalProfitRate - previousProfitRate) * 100, (value) => `${value.toFixed(1)}pt`)
          : undefined,
      deltaTone: previousProfitRate !== null && totalProfitRate !== null ? resolveDeltaTone(totalProfitRate - previousProfitRate) : undefined,
    },
    {
      label: '対象リスト',
      value: formatNumber(totals.qualifiedListRewards),
      delta: previousTotals ? formatDelta(totals.qualifiedListRewards - previousTotals.qualifiedListRewards, formatNumber) : undefined,
      deltaTone: previousTotals ? resolveDeltaTone(totals.qualifiedListRewards - previousTotals.qualifiedListRewards) : undefined,
    },
  ];

  return (
    <div className="space-y-5">
      <Card>
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">{title}</h2>
            {note ? <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">{note}</p> : null}
          </div>
        </header>

        <dl className="mt-6 grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-5">
              <dt className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-secondary)]">
                {metric.label}
              </dt>
              <dd className="mt-4 text-[2rem] font-semibold leading-none text-[color:var(--color-text-primary)]">
                {metric.value}
              </dd>
              {metric.delta ? (
                <p className={classNames('mt-3 text-xs font-medium', metric.deltaTone ? toneTextClass[metric.deltaTone] : 'text-[color:var(--color-text-muted)]')}>
                  {metric.delta}
                </p>
              ) : null}
              {metric.deltaTone ? (
                <span className={classNames('mt-3 inline-flex items-center rounded-full px-2 py-1 text-[11px] font-medium', toneBadgeClass[metric.deltaTone])}>
                  {metric.deltaTone === 'up' ? '増加傾向' : metric.deltaTone === 'down' ? '減少傾向' : '横ばい'}
                </span>
              ) : null}
            </div>
          ))}
        </dl>
      </Card>

      {showTable ? <section className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-text-primary)]">代理店別ROAS</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-text-secondary)]">
                <th className="px-4 py-3">流入元</th>
                <th className="px-4 py-3">報酬形態</th>
                <th className="px-4 py-3 text-right">成果単価</th>
                <th className="px-4 py-3 text-right">登録数</th>
                <th className="px-4 py-3 text-right">対象リスト</th>
                <th className="px-4 py-3 text-right">30日以内購入</th>
                <th className="px-4 py-3 text-right">売上</th>
                <th className="px-4 py-3 text-right">報酬</th>
                <th className="px-4 py-3 text-right">ROAS</th>
                <th className="px-4 py-3 text-right">利益</th>
                <th className="px-4 py-3 text-right">利益率</th>
              </tr>
            </thead>
            <tbody>
              {calculatedRows.map((row) => (
                <tr key={row.agency} className="border-b border-[color:var(--color-border)] last:border-b-0">
                  <td className="px-4 py-3 font-medium text-[color:var(--color-text-primary)]">{row.agency}</td>
                  <td className="px-4 py-3">
                    <select
                      value={row.mode}
                      onChange={(event) =>
                        setModes((current) => ({
                          ...current,
                          [row.agency]: event.target.value as RewardMode,
                        }))
                      }
                      className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text-primary)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                    >
                      <option value="performance">成果報酬</option>
                      <option value="list">リスト報酬</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={row.performanceRewardUnit}
                      onChange={(event) =>
                        setPerformanceRewardUnits((current) => ({
                          ...current,
                          [row.agency]: Math.max(0, Number(event.target.value) || 0),
                        }))
                      }
                      className="h-9 w-[120px] rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-right text-sm tabular-nums text-[color:var(--color-text-primary)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                    />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.registrations)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.qualifiedListRewards)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.purchasesWithin30Days)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatYen(row.revenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatYen(row.payout)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[color:var(--color-text-secondary)]">{formatRoas(row.roas)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatYen(row.profit)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-[color:var(--color-text-secondary)]">{formatRate(row.profitRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section> : null}
    </div>
  );
}
