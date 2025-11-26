'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

import { Card } from '@/components/ui/card';
import { DashboardTabsInteractive } from '@/components/dashboard/DashboardTabsInteractive';
import { DashboardDateRangePicker } from '@/components/dashboard/DashboardDateRangePicker';
import { dashboardCardClass } from '@/components/dashboard/styles';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import type { LstepAnalyticsData } from '@/lib/lstep/analytics';
import { DailyRegistrationsTable } from './DailyRegistrationsTable';
import { FunnelAnalysis } from './FunnelAnalysis';
import { CrossAnalysis, type CrossAnalysisData } from './CrossAnalysis';
import type { FunnelAnalysisResult } from '@/lib/lstep/funnel';

interface LineDashboardClientProps {
  initialData: LstepAnalyticsData;
}

type DateRangeFilter = 'yesterday' | '3days' | '7days' | '30days' | '90days' | 'all' | 'custom';

const RANGE_PRESETS: Array<{ id: Exclude<DateRangeFilter, 'custom'>; label: string }> = [
  { id: 'yesterday', label: '昨日' },
  { id: '3days', label: '過去3日' },
  { id: '7days', label: '過去7日' },
  { id: '30days', label: '過去30日' },
  { id: '90days', label: '過去90日' },
  { id: 'all', label: '全期間' },
];

const LINE_TABS = [
  { id: 'main', label: 'メイン' },
  { id: 'funnel', label: 'ファネル分析' },
  { id: 'custom_funnel', label: 'カスタムファネル' },
] as const;

type LineTabKey = (typeof LINE_TABS)[number]['id'];

const LINE_TAB_SKELETON_SECTIONS: Record<LineTabKey, number> = {
  main: 3,
  funnel: 2,
  custom_funnel: 1,
};

const TAB_SKELETON_DELAY_MS = 240;

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
    yesterday: 1,
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
  const [attributeStats, setAttributeStats] = useState(initialData.attributes);
  const [attributesLoading, setAttributesLoading] = useState(false);
  const [attributesError, setAttributesError] = useState<string | null>(null);
  const [funnelData, setFunnelData] = useState<FunnelAnalysisResult | null>(null);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [funnelError, setFunnelError] = useState<string | null>(null);
  const [crossAnalysisData, setCrossAnalysisData] = useState<CrossAnalysisData | null>(null);
  const [crossAnalysisLoading, setCrossAnalysisLoading] = useState(false);
  const [crossAnalysisError, setCrossAnalysisError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LineTabKey>('main');
  const [pendingTab, setPendingTab] = useState<LineTabKey | null>(null);
  const [isTabLoading, setIsTabLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

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

  useEffect(() => {
    let aborted = false;

    if (dateRange === 'all') {
      setAttributeStats(initialData.attributes);
      setAttributesLoading(false);
      setAttributesError(null);
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
    setAttributesLoading(true);
    setAttributesError(null);

    fetch(`/api/line/attributes?start=${range.start}&end=${range.end}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch attributes (${response.status})`);
        }
        return response.json() as Promise<{
          attributes: typeof initialData.attributes;
        }>;
      })
      .then((data) => {
        if (aborted) return;
        setAttributeStats(data.attributes);
      })
      .catch((error) => {
        if (aborted || error.name === 'AbortError') return;
        setAttributesError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!aborted) {
          setAttributesLoading(false);
        }
      });

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [customEndDate, customStartDate, dateRange, initialData.attributes]);

  // クロス分析データの取得
  useEffect(() => {
    let aborted = false;

    let range: { start: string; end: string } | null;
    if (dateRange === 'all') {
      // 全期間の場合は過去90日をデフォルトに
      const end = new Date();
      const start = new Date(end.getTime());
      start.setDate(start.getDate() - 89);
      range = {
        start: formatIsoDate(start),
        end: formatIsoDate(end),
      };
    } else if (dateRange === 'custom') {
      if (!customStartDate || !customEndDate) {
        return () => { aborted = true; };
      }
      range = normalizeCustomRange(customStartDate, customEndDate);
    } else {
      range = calculatePresetRange(dateRange);
    }

    if (!range) {
      return () => { aborted = true; };
    }

    const controller = new AbortController();
    setCrossAnalysisLoading(true);
    setCrossAnalysisError(null);

    fetch(`/api/line/cross-analysis?start=${range.start}&end=${range.end}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch cross analysis (${response.status})`);
        }
        return response.json() as Promise<CrossAnalysisData & { range: { start: string; end: string } }>;
      })
      .then((data) => {
        if (aborted) return;
        setCrossAnalysisData(data);
      })
      .catch((error) => {
        if (aborted || error.name === 'AbortError') return;
        setCrossAnalysisError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!aborted) {
          setCrossAnalysisLoading(false);
        }
      });

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [customEndDate, customStartDate, dateRange]);

  useEffect(() => {
    // custom_funnelタブがアクティブ、またはタブが切り替わった時のみフェッチ
    if (activeTab !== 'custom_funnel') {
      return () => {};
    }

    let aborted = false;
    const controller = new AbortController();
    setFunnelLoading(true);
    setFunnelError(null);

    let range: { start: string; end: string } | null = null;
    if (dateRange === 'custom') {
      if (customStartDate && customEndDate) {
        range = normalizeCustomRange(customStartDate, customEndDate);
      }
    } else if (dateRange !== 'all') {
      range = calculatePresetRange(dateRange);
    }

    const body = range
      ? {
          preset: 'igln',
          startDate: range.start,
          endDate: range.end,
        }
      : { preset: 'igln' };

    fetch('/api/line/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to fetch funnel (${response.status})`);
        }
        return response.json() as Promise<FunnelAnalysisResult>;
      })
      .then((data) => {
        if (aborted) return;
        setFunnelData(data);
      })
      .catch((error) => {
        if (aborted || error.name === 'AbortError') return;
        setFunnelError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!aborted) {
          setFunnelLoading(false);
        }
      });

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [activeTab, customEndDate, customStartDate, dateRange]);

  useEffect(() => {
    if (!isPending && isTabLoading) {
      const timer = window.setTimeout(() => {
        setIsTabLoading(false);
        setPendingTab(null);
      }, TAB_SKELETON_DELAY_MS);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [isPending, isTabLoading]);

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
        yesterday: 1,
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

    return {
      ...initialData,
      funnel,
      dailyRegistrations: dailyDataInRange,
      sources: sourceStats,
      attributes: attributeStats,
    };
  }, [customEndDate, customStartDate, dateRange, initialData, sourceStats, attributeStats]);

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

  const datePickerOptions = useMemo(
    () => [...RANGE_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })), { value: 'custom', label: 'カスタム' }],
    [],
  );

  const handleRangeSelect = (nextValue: string) => {
    setDateRange(nextValue as DateRangeFilter);
    if (nextValue !== 'custom') {
      setCustomStartDate('');
      setCustomEndDate('');
    }
  };

  const handleCustomRangeChange = (start: string, end: string) => {
    setCustomStartDate(start);
    setCustomEndDate(end);
    setDateRange('custom');
  };

  const currentTabForSkeleton: LineTabKey = pendingTab ?? activeTab;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <DashboardTabsInteractive
          items={LINE_TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
          value={activeTab}
          onChange={(next) => {
            if (next === activeTab) return;
            const nextTab = next as LineTabKey;
            setPendingTab(nextTab);
            setIsTabLoading(true);
            startTransition(() => {
              setActiveTab(nextTab);
            });
          }}
          className="flex-1 min-w-[240px]"
        />
        <DashboardDateRangePicker
          options={datePickerOptions}
          value={dateRange}
          onChange={handleRangeSelect}
          allowCustom
          customStart={customStartDate}
          customEnd={customEndDate}
          onCustomChange={handleCustomRangeChange}
          latestLabel={initialData.latestSnapshotDate ? `最新 ${formatDateLabel(initialData.latestSnapshotDate)}` : undefined}
        />
      </div>

      {isTabLoading ? (
        <PageSkeleton sections={LINE_TAB_SKELETON_SECTIONS[currentTabForSkeleton]} showFilters={false} />
      ) : (
        <>
          {activeTab === 'main' ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {summaryCards.map((card) => (
                  <Card key={card.label} className={dashboardCardClass}>
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

              {/* クロス分析セクション */}
              <div className="pt-4">
                <h2 className="text-xl font-bold text-[color:var(--color-text-primary)] mb-4">クロス分析</h2>
                <CrossAnalysis
                  data={crossAnalysisData}
                  loading={crossAnalysisLoading}
                  error={crossAnalysisError}
                />
              </div>
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

          {activeTab === 'custom_funnel' ? (
            <div className="space-y-6">
              {funnelLoading ? (
                <Card className="p-6">
                  <p className="text-sm text-[color:var(--color-text-secondary)]">
                    ファネル分析データを読み込んでいます...
                  </p>
                </Card>
              ) : funnelError ? (
                <Card className="p-6">
                  <p className="text-sm text-[color:var(--color-danger)]">
                    エラーが発生しました: {funnelError}
                  </p>
                </Card>
              ) : funnelData ? (
                <FunnelAnalysis data={funnelData} />
              ) : (
                <Card className="p-6">
                  <p className="text-sm text-[color:var(--color-text-secondary)]">
                    ファネルデータがありません。
                  </p>
                </Card>
              )}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
