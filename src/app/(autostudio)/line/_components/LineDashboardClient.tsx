'use client';

import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { LstepAnalyticsData } from '@/lib/lstep/analytics';
import { DailyRegistrationsTable } from './DailyRegistrationsTable';

interface LineDashboardClientProps {
  initialData: LstepAnalyticsData;
}

type DateRangeFilter = '3days' | '7days' | '30days' | '90days' | 'all' | 'custom';

const RANGE_PRESETS: Array<{ id: Exclude<DateRangeFilter, 'custom'>; label: string }> = [
  { id: '3days', label: '過去3日' },
  { id: '7days', label: '過去7日' },
  { id: '30days', label: '過去30日' },
  { id: '90days', label: '過去90日' },
  { id: 'all', label: '全期間' },
];

const LINE_TABS = [
  { id: 'main', label: 'メイン' },
  { id: 'funnel', label: 'ファネル分析' },
] as const;

type LineTabKey = (typeof LINE_TABS)[number]['id'];

const numberFormatter = new Intl.NumberFormat('ja-JP');
const percentFormatter = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });

function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}

function formatPercent(value: number): string {
  return `${percentFormatter.format(value)}%`;
}

function formatDateLabel(value: string): string {
  return dateFormatter.format(new Date(value));
}

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeCustomRange(start: string, end: string): { start: string; end: string } | null {
  if (!start || !end) return null;
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return null;
  }
  if (startDate.getTime() > endDate.getTime()) {
    return { start: formatIsoDate(endDate), end: formatIsoDate(startDate) };
  }
  return { start: formatIsoDate(startDate), end: formatIsoDate(endDate) };
}

function calculatePresetRange(range: DateRangeFilter): { start: string; end: string } | null {
  const daysMap: Record<DateRangeFilter, number | null> = {
    '3days': 3,
    '7days': 7,
    '30days': 30,
    '90days': 90,
    all: null,
    custom: null,
  };

  const days = daysMap[range];
  if (!days) return null;

  const end = new Date();
  const start = new Date(end.getTime());
  start.setDate(start.getDate() - (days - 1));

  return {
    start: formatIsoDate(start),
    end: formatIsoDate(end),
  };
}

export function LineDashboardClient({ initialData }: LineDashboardClientProps) {
  const [dateRange, setDateRange] = useState<DateRangeFilter>('3days');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [sourceStats, setSourceStats] = useState(initialData.sources);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LineTabKey>('main');

  useEffect(() => {
    let aborted = false;

    if (dateRange === 'all') {
      setSourceStats(initialData.sources);
      setSourcesLoading(false);
      setSourcesError(null);
      return () => {
        aborted = true;
      };
    }

    let range: { start: string; end: string } | null;
    if (dateRange === 'custom') {
      if (!customStartDate || !customEndDate) {
        return () => {
          aborted = true;
        };
      }
      range = normalizeCustomRange(customStartDate, customEndDate);
    } else {
      range = calculatePresetRange(dateRange);
    }

    if (!range) {
      return () => {
        aborted = true;
      };
    }

    const controller = new AbortController();
    setSourcesLoading(true);
    setSourcesError(null);

    fetch(`/api/line/source-counts?start=${range.start}&end=${range.end}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch source counts (${response.status})`);
        }
        return response.json() as Promise<{
          threads: number;
          instagram: number;
          youtube: number;
          organic: number;
          other: number;
        }>;
      })
      .then((data) => {
        if (aborted) return;
        const { threads, instagram, youtube, organic, other } = data;
        const total = threads + instagram + youtube + organic + other;
        const toPercent = (value: number) => (total > 0 ? (value / total) * 100 : 0);

        setSourceStats({
          threads,
          threadsPercent: toPercent(threads),
          instagram,
          instagramPercent: toPercent(instagram),
          youtube,
          youtubePercent: toPercent(youtube),
          other,
          otherPercent: toPercent(other),
          organic,
          organicPercent: toPercent(organic),
        });
      })
      .catch((error) => {
        if (aborted || error.name === 'AbortError') return;
        setSourcesError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!aborted) {
          setSourcesLoading(false);
        }
      });

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [customEndDate, customStartDate, dateRange, initialData.sources]);

  const filteredAnalytics = useMemo(() => {
    let dailyDataInRange = initialData.dailyRegistrations;

    if (dateRange === 'custom' && customStartDate && customEndDate) {
      const start = new Date(customStartDate);
      const end = new Date(customEndDate);
      dailyDataInRange = initialData.dailyRegistrations.filter((item) => {
        const target = new Date(item.date);
        return target >= start && target <= end;
      });
    } else if (dateRange !== 'all') {
      const daysLookup: Record<Exclude<DateRangeFilter, 'custom'>, number | null> = {
        '3days': 3,
        '7days': 7,
        '30days': 30,
        '90days': 90,
        all: null,
      };
      const take = daysLookup[dateRange as Exclude<DateRangeFilter, 'custom'>];
      if (take) {
        dailyDataInRange = initialData.dailyRegistrations.slice(0, take);
      }
    }

    const totalRegistrations = dailyDataInRange.reduce((sum, day) => sum + day.registrations, 0);
    const totalSurveyCompleted = dailyDataInRange.reduce((sum, day) => sum + day.surveyCompleted, 0);

    const baseRegistrations = initialData.funnel.lineRegistration;
    const registrationRatio = baseRegistrations > 0 ? totalRegistrations / baseRegistrations : 0;

    const surveyEnteredEstimate =
      dateRange === 'all'
        ? initialData.funnel.surveyEntered
        : Math.round(initialData.funnel.surveyEntered * registrationRatio);

    const surveyCompletedValue =
      dateRange === 'all' ? initialData.funnel.surveyCompleted : totalSurveyCompleted;

    const funnel = {
      lineRegistration: totalRegistrations,
      surveyEntered: surveyEnteredEstimate,
      surveyCompleted: surveyCompletedValue,
      surveyEnteredCVR: totalRegistrations > 0 ? (surveyEnteredEstimate / totalRegistrations) * 100 : 0,
      surveyCompletedCVR: surveyEnteredEstimate > 0 ? (surveyCompletedValue / surveyEnteredEstimate) * 100 : 0,
    };

    const scaleAttributeCount = (count: number) => Math.round(count * registrationRatio);

    const attributes = {
      age: initialData.attributes.age.map((item) => ({
        ...item,
        count: dateRange === 'all' ? item.count : scaleAttributeCount(item.count),
      })),
      job: initialData.attributes.job.map((item) => ({
        ...item,
        count: dateRange === 'all' ? item.count : scaleAttributeCount(item.count),
      })),
      currentRevenue: initialData.attributes.currentRevenue.map((item) => ({
        ...item,
        count: dateRange === 'all' ? item.count : scaleAttributeCount(item.count),
      })),
      goalRevenue: initialData.attributes.goalRevenue.map((item) => ({
        ...item,
        count: dateRange === 'all' ? item.count : scaleAttributeCount(item.count),
      })),
    };

    return {
      ...initialData,
      funnel,
      dailyRegistrations: dailyDataInRange,
      sources: sourceStats,
      attributes,
    };
  }, [customEndDate, customStartDate, dateRange, initialData, sourceStats]);

  const summaryCards = useMemo(() => {
    const days = filteredAnalytics.dailyRegistrations.length;
    const registrations = filteredAnalytics.funnel.lineRegistration;
    const surveyEntered = filteredAnalytics.funnel.surveyEntered;
    const surveyCompleted = filteredAnalytics.funnel.surveyCompleted;
    const latestDate = filteredAnalytics.dailyRegistrations[0]?.date ?? null;
    const averagePerDay = days > 0 ? registrations / days : 0;
    const surveyResponseRate = registrations > 0 ? (surveyCompleted / registrations) * 100 : 0;

    return [
      {
        label: '登録者数 (期間計)',
        primary: `${formatNumber(registrations)}人`,
        secondary: days > 0 ? `平均 ${formatNumber(averagePerDay)}人/日` : null,
      },
      {
        label: 'アンケート遷移数',
        primary: `${formatNumber(surveyEntered)}人`,
        secondary: registrations > 0 ? `移行率 ${formatPercent(filteredAnalytics.funnel.surveyEnteredCVR)}` : null,
      },
      {
        label: 'アンケート完了数',
        primary: `${formatNumber(surveyCompleted)}人`,
        secondary: surveyEntered > 0 ? `完了率 ${formatPercent(filteredAnalytics.funnel.surveyCompletedCVR)}` : null,
      },
      {
        label: 'アンケート回答率',
        primary: formatPercent(surveyResponseRate),
        secondary: `回答数 ${formatNumber(surveyCompleted)}人${latestDate ? `・最新 ${formatDateLabel(latestDate)}` : ''}`,
      },
    ];
  }, [filteredAnalytics]);

  const rangeSummary = useMemo(() => {
    if (dateRange === 'custom') {
      if (customStartDate && customEndDate) {
        return `${customStartDate} 〜 ${customEndDate}`;
      }
      return '日付指定';
    }
    const preset = RANGE_PRESETS.find((item) => item.id === dateRange);
    return preset ? preset.label : '全期間';
  }, [customEndDate, customStartDate, dateRange]);

  const funnelCards = useMemo(() => {
    const completionFromRegistration =
      filteredAnalytics.funnel.lineRegistration > 0
        ? (filteredAnalytics.funnel.surveyCompleted / filteredAnalytics.funnel.lineRegistration) * 100
        : 0;

    return [
      {
        label: 'LINE登録数',
        value: `${formatNumber(filteredAnalytics.funnel.lineRegistration)}人`,
        helper: dateRange === 'all' ? '全期間累計' : '期間内合計',
      },
      {
        label: 'アンケート遷移数',
        value: `${formatNumber(filteredAnalytics.funnel.surveyEntered)}人`,
        helper:
          filteredAnalytics.funnel.lineRegistration > 0
            ? `移行率 ${formatPercent(filteredAnalytics.funnel.surveyEnteredCVR)}`
            : '移行率 —',
      },
      {
        label: 'アンケート完了数',
        value: `${formatNumber(filteredAnalytics.funnel.surveyCompleted)}人`,
        helper:
          filteredAnalytics.funnel.surveyEntered > 0
            ? `完了率 ${formatPercent(filteredAnalytics.funnel.surveyCompletedCVR)}`
            : '完了率 —',
      },
      {
        label: '登録→完了CVR',
        value: formatPercent(completionFromRegistration),
        helper: 'LINE登録からの完了率',
      },
    ];
  }, [dateRange, filteredAnalytics.funnel]);

  const sourceEntries = useMemo(
    () => [
      { key: 'threads', label: 'Threads', count: filteredAnalytics.sources.threads, percent: filteredAnalytics.sources.threadsPercent },
      { key: 'instagram', label: 'Instagram', count: filteredAnalytics.sources.instagram, percent: filteredAnalytics.sources.instagramPercent },
      { key: 'youtube', label: 'YouTube', count: filteredAnalytics.sources.youtube, percent: filteredAnalytics.sources.youtubePercent },
      { key: 'other', label: 'その他', count: filteredAnalytics.sources.other, percent: filteredAnalytics.sources.otherPercent },
      { key: 'organic', label: 'オーガニック', count: filteredAnalytics.sources.organic, percent: filteredAnalytics.sources.organicPercent },
    ],
    [filteredAnalytics.sources],
  );

  const attributeGroups = useMemo(
    () => [
      { title: '年齢層', items: filteredAnalytics.attributes.age },
      { title: '職業', items: filteredAnalytics.attributes.job },
      { title: '現在の売上（月商）', items: filteredAnalytics.attributes.currentRevenue },
      { title: '目標売上（月商）', items: filteredAnalytics.attributes.goalRevenue },
    ],
    [filteredAnalytics.attributes],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {LINE_TABS.map((tab) => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? 'primary' : 'secondary'}
              onClick={() => setActiveTab(tab.id)}
              className="px-5"
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={dateRange}
            onChange={(event) => setDateRange(event.target.value as DateRangeFilter)}
            className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
          >
            <option value="3days">過去3日</option>
            <option value="7days">過去7日</option>
            <option value="30days">過去30日</option>
            <option value="90days">過去90日</option>
            <option value="all">全期間</option>
            <option value="custom">カスタム</option>
          </select>
          <span className="text-xs text-[color:var(--color-text-muted)]">{rangeSummary}</span>
          {initialData.latestSnapshotDate ? (
            <span className="text-xs text-[color:var(--color-text-muted)]">
              最新 {formatDateLabel(initialData.latestSnapshotDate)}
            </span>
          ) : null}
        </div>
      </div>
      {dateRange === 'custom' ? (
        <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-[color:var(--color-text-secondary)]">
          <label className="flex items-center gap-1">
            <span>開始</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(event) => setCustomStartDate(event.target.value)}
              max={customEndDate || undefined}
              className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-[color:var(--color-text-primary)]"
            />
          </label>
          <label className="flex items-center gap-1">
            <span>終了</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(event) => setCustomEndDate(event.target.value)}
              min={customStartDate || undefined}
              className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-[color:var(--color-text-primary)]"
            />
          </label>
        </div>
      ) : null}

      {activeTab === 'main' ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {summaryCards.map((card) => (
              <Card key={card.label} className="p-4">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">{card.label}</p>
                <p className="mt-3 text-xl font-semibold text-[color:var(--color-text-primary)]">{card.primary}</p>
                {card.secondary ? (
                  <p className="mt-2 text-xs text-[color:var(--color-text-secondary)]">{card.secondary}</p>
                ) : null}
              </Card>
            ))}
          </div>

          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">日別登録数</h2>
                <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                  LSTEPの登録数とアンケート完了数を日別に確認できます。
                </p>
              </div>
              <span className="text-xs text-[color:var(--color-text-muted)]">
                直近 {filteredAnalytics.dailyRegistrations.length} 日
              </span>
            </div>
            <div className="mt-4">
              <DailyRegistrationsTable data={filteredAnalytics.dailyRegistrations} hideFilter />
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">流入経路</h2>
              {sourcesLoading ? (
                <span className="text-xs text-[color:var(--color-text-muted)]">最新の流入データを取得しています…</span>
              ) : null}
            </div>
            {sourcesError ? (
              <p className="mt-3 text-xs text-[color:var(--color-danger)]">{sourcesError}</p>
            ) : null}
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {sourceEntries.map((source) => (
                <div
                  key={source.key}
                  className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4 text-center shadow-[var(--shadow-soft)]"
                >
                  <p className="text-sm font-medium text-[color:var(--color-text-secondary)]">{source.label}</p>
                  <p className="mt-3 text-2xl font-semibold text-[color:var(--color-text-primary)]">
                    {formatNumber(source.count)}
                  </p>
                  <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">{formatPercent(source.percent)}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">属性分析</h2>
            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              {attributeGroups.map((group) => (
                <div key={group.title} className="space-y-3">
                  <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">{group.title}</h3>
                  {group.items.length === 0 ? (
                    <p className="text-sm text-[color:var(--color-text-muted)]">データがありません。</p>
                  ) : (
                    group.items.map((item) => (
                      <div key={item.label} className="flex items-center gap-3">
                        <div className="w-28 text-sm text-[color:var(--color-text-secondary)] font-medium">{item.label}</div>
                        <div className="flex-1 h-6 rounded-[var(--radius-sm)] bg-[color:var(--color-surface-muted)]">
                          <div
                            className="h-full rounded-[var(--radius-sm)] bg-[color:var(--color-accent)] transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }}
                          />
                        </div>
                        <div className="min-w-[110px] text-right text-xs text-[color:var(--color-text-secondary)]">
                          {formatNumber(item.count)}人 ({formatPercent(item.percent)})
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      {activeTab === 'funnel' ? (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">ファネル分析</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {funnelCards.map((card) => (
              <div
                key={card.label}
                className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 shadow-[var(--shadow-soft)]"
              >
                <p className="text-xs font-medium text-[color:var(--color-text-secondary)]">{card.label}</p>
                <p className="mt-3 text-2xl font-semibold text-[color:var(--color-text-primary)]">{card.value}</p>
                {card.helper ? (
                  <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">{card.helper}</p>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
