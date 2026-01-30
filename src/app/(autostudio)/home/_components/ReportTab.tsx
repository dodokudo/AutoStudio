'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { dashboardCardClass } from '@/components/dashboard/styles';

type ReportMode = 'monthly' | 'weekly';

interface MetricRow {
  label: string;
  actual: number;
  target: number;
  rate: number;
}

interface MonthlyReportResponse {
  success: boolean;
  data: {
    month: string;
    period: { start: string; end: string };
    metrics: MetricRow[];
    narrative: string[];
  };
}

interface WeeklyReportResponse {
  success: boolean;
  data: {
    period: { start: string; end: string };
    metrics: MetricRow[];
  };
}

const numberFormatter = new Intl.NumberFormat('ja-JP');

function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}

function formatCurrency(value: number): string {
  if (value >= 10000) {
    return `${formatNumber(value / 10000)}万円`;
  }
  return `${formatNumber(value)}円`;
}

function formatValue(label: string, value: number): string {
  if (label === '売上') return formatCurrency(value);
  if (label === 'Threads' || label === 'Instagram') return `${formatNumber(value)}人`;
  return `${formatNumber(value)}件`;
}

function getWeeks(count = 12) {
  const weeks: Array<{ start: string; end: string; label: string }> = [];
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const currentMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);

  for (let i = 0; i < count; i++) {
    const start = new Date(currentMonday);
    start.setDate(start.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const startKey = start.toISOString().slice(0, 10);
    const endKey = end.toISOString().slice(0, 10);
    const label = `${startKey.replace(/-/g, '/')}〜${endKey.replace(/-/g, '/')}`;
    weeks.push({ start: startKey, end: endKey, label });
  }

  return weeks;
}

export function ReportTab({ currentMonth }: { currentMonth: string }) {
  const [mode, setMode] = useState<ReportMode>('monthly');
  const [month, setMonth] = useState(currentMonth);
  const weekOptions = useMemo(() => getWeeks(16), []);
  const [week, setWeek] = useState(weekOptions[0]);
  const [monthlyData, setMonthlyData] = useState<MonthlyReportResponse['data'] | null>(null);
  const [weeklyData, setWeeklyData] = useState<WeeklyReportResponse['data'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monthOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [];
    const [year, monthNum] = currentMonth.split('-').map(Number);
    const anchor = new Date(year, monthNum - 1, 1);
    for (let i = 0; i < 12; i++) {
      const d = new Date(anchor);
      d.setMonth(d.getMonth() - i);
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `${d.getFullYear()}年${d.getMonth() + 1}月`;
      options.push({ value, label });
    }
    return options;
  }, [currentMonth]);

  const loadMonthly = async (nextMonth: string) => {
    setMonth(nextMonth);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/home/report/monthly?month=${nextMonth}`);
      if (!res.ok) throw new Error(await res.text());
      const payload = (await res.json()) as MonthlyReportResponse;
      setMonthlyData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const loadWeekly = async (nextWeek: { start: string; end: string; label: string }) => {
    setWeek(nextWeek);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/home/report/weekly?start=${nextWeek.start}&end=${nextWeek.end}`);
      if (!res.ok) throw new Error(await res.text());
      const payload = (await res.json()) as WeeklyReportResponse;
      setWeeklyData(payload.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const metrics = mode === 'monthly' ? monthlyData?.metrics : weeklyData?.metrics;
  const narrative = monthlyData?.narrative ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMode('monthly');
              setMonthlyData(null);
              setError(null);
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium ${mode === 'monthly' ? 'bg-[color:var(--color-accent)] text-white' : 'border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)]'}`}
          >
            月報
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('weekly');
              setWeeklyData(null);
              setError(null);
            }}
            className={`px-4 py-2 rounded-md text-sm font-medium ${mode === 'weekly' ? 'bg-[color:var(--color-accent)] text-white' : 'border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)]'}`}
          >
            週報
          </button>
        </div>
        <span className="text-xs text-[color:var(--color-text-muted)]">
          {mode === 'monthly' ? '月を選ぶとレポートを表示' : '週を選ぶとレポートを表示'}
        </span>
      </div>

      {mode === 'monthly' ? (
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {monthOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => loadMonthly(opt.value)}
              className={`rounded-md border px-3 py-2 text-sm ${month === opt.value ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 text-[color:var(--color-text-primary)]' : 'border-[color:var(--color-border)] text-[color:var(--color-text-secondary)]'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {weekOptions.map((opt) => (
            <button
              key={opt.start}
              type="button"
              onClick={() => loadWeekly(opt)}
              className={`rounded-md border px-3 py-2 text-sm ${week.start === opt.start ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 text-[color:var(--color-text-primary)]' : 'border-[color:var(--color-border)] text-[color:var(--color-text-secondary)]'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <Card className={dashboardCardClass}>
          <p className="text-sm text-[color:var(--color-text-muted)]">レポートを読み込み中...</p>
        </Card>
      ) : null}

      {error ? (
        <Card className={dashboardCardClass}>
          <p className="text-sm text-red-500">{error}</p>
        </Card>
      ) : null}

      {metrics ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metrics.map((metric) => (
            <Card key={metric.label} className={dashboardCardClass}>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">
                {metric.label}
              </p>
              <p className="mt-3 text-lg font-semibold text-[color:var(--color-text-primary)]">
                {formatValue(metric.label, metric.actual)}
              </p>
              <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">
                目標 {formatValue(metric.label, metric.target)}
              </p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--color-text-primary)]">
                達成率 {metric.rate.toFixed(1)}%
              </p>
            </Card>
          ))}
        </div>
      ) : null}

      {mode === 'monthly' && narrative.length > 0 ? (
        <Card className="p-6">
          <h3 className="text-lg font-semibold text-[color:var(--color-text-primary)]">月報サマリー</h3>
          <div className="mt-3 space-y-2 text-sm text-[color:var(--color-text-secondary)]">
            {narrative.map((line) => (
              <p key={line}>・{line}</p>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
