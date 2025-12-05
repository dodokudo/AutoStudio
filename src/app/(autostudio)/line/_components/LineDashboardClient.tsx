'use client';

import { useEffect, useMemo, useState, useTransition, useCallback } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import useSWR from 'swr';

import { Card } from '@/components/ui/card';
import { DashboardTabsInteractive } from '@/components/dashboard/DashboardTabsInteractive';
import { DashboardDateRangePicker } from '@/components/dashboard/DashboardDateRangePicker';
import { dashboardCardClass } from '@/components/dashboard/styles';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import type { LstepAnalyticsData } from '@/lib/lstep/analytics';
import type { FunnelDefinition, FunnelAnalysisResult } from '@/lib/lstep/funnel';
import { DailyRegistrationsTable } from './DailyRegistrationsTable';
import { LineFunnelsManager } from './LineFunnelsManager';
import { CrossAnalysis, type CrossAnalysisData } from './CrossAnalysis';
import { UNIFIED_RANGE_OPTIONS, resolveDateRange, formatDateInput, type UnifiedRangePreset, isUnifiedRangePreset } from '@/lib/dateRangePresets';

const fetcher = async (input: RequestInfo) => {
  const res = await fetch(input.toString());
  if (!res.ok) throw new Error(await res.text());
  return res.json();
};

interface FunnelListResponse {
  custom: FunnelDefinition[];
}

interface LineDashboardClientProps {
  initialData: LstepAnalyticsData;
}

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

// 期間比較用ユーティリティ
function getDateNDaysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

const MAIN_COMPARISON_DATES_KEY = 'line-main-comparison-dates';

interface MainComparisonDates {
  periodAStart: string;
  periodAEnd: string;
  periodBStart: string;
  periodBEnd: string;
}

function loadMainComparisonDates(): MainComparisonDates | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(MAIN_COMPARISON_DATES_KEY);
    if (!stored) return null;
    return JSON.parse(stored) as MainComparisonDates;
  } catch {
    return null;
  }
}

function saveMainComparisonDates(dates: MainComparisonDates): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(MAIN_COMPARISON_DATES_KEY, JSON.stringify(dates));
  } catch {
    // ignore
  }
}

const toStartOfDay = (date: Date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setHours(0, 0, 0, 0);
  return d;
};

const toEndOfDay = (date: Date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return d;
};

function adjustRangeWithSnapshot(rangeStart: Date, rangeEnd: Date, latestSnapshotDate?: string | null) {
  if (!latestSnapshotDate) return { start: rangeStart, end: rangeEnd };
  const snapshotDate = toStartOfDay(new Date(latestSnapshotDate));
  if (Number.isNaN(snapshotDate.getTime())) return { start: rangeStart, end: rangeEnd };
  const currentEnd = rangeEnd;
  if (snapshotDate <= currentEnd) return { start: rangeStart, end: rangeEnd };

  // Extend end to snapshot date, keep duration
  const durationDays = Math.max(1, Math.round((rangeEnd.getTime() - rangeStart.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  const newEnd = toEndOfDay(snapshotDate);
  const newStart = toStartOfDay(new Date(newEnd.getTime() - (durationDays - 1) * 24 * 60 * 60 * 1000));
  return { start: newStart, end: newEnd };
}

export function LineDashboardClient({ initialData }: LineDashboardClientProps) {
  const [dateRange, setDateRange] = useState<UnifiedRangePreset>('7d');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [sourceStats, setSourceStats] = useState(initialData.sources);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [attributeStats, setAttributeStats] = useState(initialData.attributes);
  const [attributesLoading, setAttributesLoading] = useState(false);
  const [attributesError, setAttributesError] = useState<string | null>(null);
  const [crossAnalysisData, setCrossAnalysisData] = useState<CrossAnalysisData | null>(null);
  const [crossAnalysisLoading, setCrossAnalysisLoading] = useState(false);
  const [crossAnalysisError, setCrossAnalysisError] = useState<string | null>(null);
  // メインタブ用カスタムファネル
  const [mainFunnelList, setMainFunnelList] = useState<FunnelDefinition[]>([]);
  const [selectedMainFunnelId, setSelectedMainFunnelId] = useState<string | null>(null);
  const [mainFunnelResult, setMainFunnelResult] = useState<FunnelAnalysisResult | null>(null);
  const [mainFunnelLoading, setMainFunnelLoading] = useState(false);
  const [mainFunnelError, setMainFunnelError] = useState<string | null>(null);
  const [mainFunnelDropdownOpen, setMainFunnelDropdownOpen] = useState(false);
  // メインタブ用期間比較
  const [mainPeriodAStart, setMainPeriodAStart] = useState(() => {
    const saved = loadMainComparisonDates();
    return saved?.periodAStart ?? getDateNDaysAgo(60);
  });
  const [mainPeriodAEnd, setMainPeriodAEnd] = useState(() => {
    const saved = loadMainComparisonDates();
    return saved?.periodAEnd ?? getDateNDaysAgo(31);
  });
  const [mainPeriodBStart, setMainPeriodBStart] = useState(() => {
    const saved = loadMainComparisonDates();
    return saved?.periodBStart ?? getDateNDaysAgo(30);
  });
  const [mainPeriodBEnd, setMainPeriodBEnd] = useState(() => {
    const saved = loadMainComparisonDates();
    return saved?.periodBEnd ?? getDateNDaysAgo(1);
  });
  const [mainComparisonResultA, setMainComparisonResultA] = useState<FunnelAnalysisResult | null>(null);
  const [mainComparisonResultB, setMainComparisonResultB] = useState<FunnelAnalysisResult | null>(null);
  const [mainComparisonLoading, setMainComparisonLoading] = useState(false);
  const [mainComparisonError, setMainComparisonError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LineTabKey>('main');
  const [pendingTab, setPendingTab] = useState<LineTabKey | null>(null);
  const [isTabLoading, setIsTabLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let aborted = false;

    const rangePreset = isUnifiedRangePreset(dateRange) ? dateRange : '7d';
    const resolved = resolveDateRange(rangePreset, customStartDate, customEndDate);
    const adjusted = adjustRangeWithSnapshot(resolved.start, resolved.end, initialData.latestSnapshotDate);
    const startKey = formatDateInput(adjusted.start);
    const endKey = formatDateInput(adjusted.end);

    if (resolved.preset === 'all') {
      setSourceStats(initialData.sources);
      setSourcesLoading(false);
      setSourcesError(null);
      return () => {
        aborted = true;
      };
    }

    const controller = new AbortController();
    setSourcesLoading(true);
    setSourcesError(null);

    fetch(`/api/line/source-counts?start=${startKey}&end=${endKey}`, { signal: controller.signal })
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

    const rangePreset = isUnifiedRangePreset(dateRange) ? dateRange : '7d';
    const resolved = resolveDateRange(rangePreset, customStartDate, customEndDate);
    const adjusted = adjustRangeWithSnapshot(resolved.start, resolved.end, initialData.latestSnapshotDate);
    const startKey = formatDateInput(adjusted.start);
    const endKey = formatDateInput(adjusted.end);

    if (resolved.preset === 'all') {
      setAttributeStats(initialData.attributes);
      setAttributesLoading(false);
      setAttributesError(null);
      return () => {
        aborted = true;
      };
    }

    const controller = new AbortController();
    setAttributesLoading(true);
    setAttributesError(null);

    fetch(`/api/line/attributes?start=${startKey}&end=${endKey}`, { signal: controller.signal })
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

    const rangePreset = isUnifiedRangePreset(dateRange) ? dateRange : '7d';
    const resolved = resolveDateRange(rangePreset, customStartDate, customEndDate);
    const adjusted = adjustRangeWithSnapshot(resolved.start, resolved.end, initialData.latestSnapshotDate);
    const startKey = formatDateInput(adjusted.start);
    const endKey = formatDateInput(adjusted.end);

    const controller = new AbortController();
    setCrossAnalysisLoading(true);
    setCrossAnalysisError(null);

    fetch(`/api/line/cross-analysis?start=${startKey}&end=${endKey}`, { signal: controller.signal })
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

  // メインタブ用: 期間比較の日付が変更されたらローカルストレージに保存
  useEffect(() => {
    saveMainComparisonDates({
      periodAStart: mainPeriodAStart,
      periodAEnd: mainPeriodAEnd,
      periodBStart: mainPeriodBStart,
      periodBEnd: mainPeriodBEnd,
    });
  }, [mainPeriodAStart, mainPeriodAEnd, mainPeriodBStart, mainPeriodBEnd]);

  // メインタブ用: カスタムファネル一覧を取得
  useEffect(() => {
    let aborted = false;
    fetch('/api/line/funnel')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch funnels');
        return res.json() as Promise<FunnelListResponse>;
      })
      .then((data) => {
        if (aborted) return;
        setMainFunnelList(data.custom ?? []);
        // 初期選択: 最初のファネル
        if (!selectedMainFunnelId && data.custom?.length > 0) {
          setSelectedMainFunnelId(data.custom[0].id);
        }
      })
      .catch((err) => {
        if (aborted) return;
        console.error('Failed to load funnels', err);
      });
    return () => {
      aborted = true;
    };
  }, []);

  // メインタブ用: 選択されたファネルの分析を実行
  useEffect(() => {
    if (!selectedMainFunnelId) {
      setMainFunnelResult(null);
      return;
    }
    const selectedFunnel = mainFunnelList.find((f) => f.id === selectedMainFunnelId);
    if (!selectedFunnel) {
      setMainFunnelResult(null);
      return;
    }

    const rangePreset = isUnifiedRangePreset(dateRange) ? dateRange : '7d';
    const resolved = resolveDateRange(rangePreset, customStartDate, customEndDate);
    const adjusted = adjustRangeWithSnapshot(resolved.start, resolved.end, initialData.latestSnapshotDate);
    const startKey = formatDateInput(adjusted.start);
    const endKey = formatDateInput(adjusted.end);

    let aborted = false;
    const controller = new AbortController();
    setMainFunnelLoading(true);
    setMainFunnelError(null);

    fetch('/api/line/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        funnelDefinition: selectedFunnel,
        startDate: startKey,
        endDate: endKey,
      }),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to analyze funnel');
        return res.json() as Promise<FunnelAnalysisResult>;
      })
      .then((data) => {
        if (aborted) return;
        setMainFunnelResult(data);
      })
      .catch((err) => {
        if (aborted || err.name === 'AbortError') return;
        setMainFunnelError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!aborted) setMainFunnelLoading(false);
      });

    return () => {
      aborted = true;
      controller.abort();
    };
  }, [selectedMainFunnelId, mainFunnelList, dateRange, customStartDate, customEndDate, initialData.latestSnapshotDate]);

  // メインタブ用: 期間比較を実行
  const runMainComparison = useCallback(async () => {
    if (!selectedMainFunnelId) return;
    const selectedFunnel = mainFunnelList.find((f) => f.id === selectedMainFunnelId);
    if (!selectedFunnel) return;

    setMainComparisonLoading(true);
    setMainComparisonError(null);

    try {
      const [resA, resB] = await Promise.all([
        fetch('/api/line/funnel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            funnelDefinition: selectedFunnel,
            startDate: mainPeriodAStart,
            endDate: mainPeriodAEnd,
          }),
        }),
        fetch('/api/line/funnel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            funnelDefinition: selectedFunnel,
            startDate: mainPeriodBStart,
            endDate: mainPeriodBEnd,
          }),
        }),
      ]);

      if (!resA.ok || !resB.ok) throw new Error('比較データの取得に失敗しました');

      const [dataA, dataB] = await Promise.all([
        resA.json() as Promise<FunnelAnalysisResult>,
        resB.json() as Promise<FunnelAnalysisResult>,
      ]);

      setMainComparisonResultA(dataA);
      setMainComparisonResultB(dataB);
    } catch (err) {
      setMainComparisonError(err instanceof Error ? err.message : String(err));
    } finally {
      setMainComparisonLoading(false);
    }
  }, [selectedMainFunnelId, mainFunnelList, mainPeriodAStart, mainPeriodAEnd, mainPeriodBStart, mainPeriodBEnd]);

  // メインタブ用: 初期表示時に期間比較を自動実行
  useEffect(() => {
    if (selectedMainFunnelId && mainFunnelList.length > 0 && !mainComparisonResultA && !mainComparisonLoading) {
      runMainComparison();
    }
  }, [selectedMainFunnelId, mainFunnelList, mainComparisonResultA, mainComparisonLoading, runMainComparison]);

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
    const resolved = resolveDateRange(dateRange, customStartDate, customEndDate);
    const adjusted = adjustRangeWithSnapshot(resolved.start, resolved.end, initialData.latestSnapshotDate);
    const rangeStart = adjusted.start;
    const rangeEnd = adjusted.end;

    const dailyDataInRange = initialData.dailyRegistrations.filter((item) => {
      const target = new Date(item.date);
      return target >= rangeStart && target <= rangeEnd;
    });

    const totalRegistrations = dailyDataInRange.reduce((sum, day) => sum + day.registrations, 0);
    const totalSurveyCompleted = dailyDataInRange.reduce((sum, day) => sum + day.surveyCompleted, 0);

    const baseRegistrations = initialData.funnel.lineRegistration;
    const registrationRatio = baseRegistrations > 0 ? totalRegistrations / baseRegistrations : 0;

    const surveyEnteredEstimate =
      resolved.preset === 'all'
        ? initialData.funnel.surveyEntered
        : Math.round(initialData.funnel.surveyEntered * registrationRatio);

    const surveyCompletedValue =
      resolved.preset === 'all' ? initialData.funnel.surveyCompleted : totalSurveyCompleted;

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
        label: 'アンケート完了数',
        primary: `${formatNumber(surveyCompleted)}人`,
        secondary: registrations > 0 ? `完了率 ${formatPercent(filteredAnalytics.funnel.surveyCompletedCVR)}` : null,
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

  // 性別データ（円グラフ用）
  const genderData = useMemo(() => {
    const gender = filteredAnalytics.attributes.gender ?? [];
    return gender.map((item) => ({
      name: item.label,
      value: item.count,
      percent: item.percent,
    }));
  }, [filteredAnalytics.attributes.gender]);

  // 性別以外の属性グループ
  const attributeGroups = useMemo(
    () => [
      { title: '年齢層', items: filteredAnalytics.attributes.age },
      { title: '職業', items: filteredAnalytics.attributes.job },
      { title: '現在の売上（月商）', items: filteredAnalytics.attributes.currentRevenue },
      { title: '目標売上（月商）', items: filteredAnalytics.attributes.goalRevenue },
    ],
    [filteredAnalytics.attributes],
  );

  const datePickerOptions = useMemo(() => UNIFIED_RANGE_OPTIONS, []);

  const handleRangeSelect = (nextValue: string) => {
    const preset = isUnifiedRangePreset(nextValue) ? nextValue : '7d';
    setDateRange(preset);
    if (preset !== 'custom') {
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
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

              {/* 日別登録数と流入経路を左右レイアウト */}
              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">日別登録数</h2>
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
                      <span className="text-xs text-[color:var(--color-text-muted)]">取得中…</span>
                    ) : null}
                  </div>
                  {sourcesError ? (
                    <p className="mt-3 text-xs text-[color:var(--color-danger)]">{sourcesError}</p>
                  ) : null}
                  <div className="mt-4 space-y-3">
                    {sourceEntries.map((source) => (
                      <div key={source.key} className="flex items-center gap-3">
                        <div className="w-24 text-sm font-medium text-[color:var(--color-text-secondary)]">
                          {source.label}
                        </div>
                        <div className="flex-1 h-6 bg-[color:var(--color-surface-muted)] rounded-[var(--radius-sm)] overflow-hidden">
                          <div
                            className="h-full bg-[color:var(--color-accent)] transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(0, source.percent))}%` }}
                          />
                        </div>
                        <div className="w-16 text-right text-sm font-semibold text-[color:var(--color-text-primary)]">
                          {formatNumber(source.count)}
                        </div>
                        <div className="w-14 text-right text-xs text-[color:var(--color-text-muted)]">
                          {formatPercent(source.percent)}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

              {/* ファネル進捗（メインタブ用） */}
              {mainFunnelList.length > 0 && (
                <Card className="p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">ファネル進捗</h2>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setMainFunnelDropdownOpen(!mainFunnelDropdownOpen)}
                          className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-1.5 text-sm font-medium text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-surface-muted)] transition"
                        >
                          {mainFunnelList.find(f => f.id === selectedMainFunnelId)?.name ?? 'ファネルを選択'}
                          <svg
                            className={`h-4 w-4 transition-transform ${mainFunnelDropdownOpen ? 'rotate-180' : ''}`}
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {mainFunnelDropdownOpen && (
                          <>
                            <div
                              className="fixed inset-0 z-10"
                              onClick={() => setMainFunnelDropdownOpen(false)}
                            />
                            <div className="absolute top-full left-0 z-20 mt-1 min-w-[200px] rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white py-1 shadow-lg">
                              {mainFunnelList.map((funnel) => (
                                <button
                                  key={funnel.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedMainFunnelId(funnel.id);
                                    setMainFunnelDropdownOpen(false);
                                  }}
                                  className={`w-full px-3 py-2 text-left text-sm transition hover:bg-[color:var(--color-surface-muted)] ${
                                    funnel.id === selectedMainFunnelId
                                      ? 'bg-[color:var(--color-accent-muted)] text-[color:var(--color-accent-dark)]'
                                      : 'text-[color:var(--color-text-primary)]'
                                  }`}
                                >
                                  <div className="font-medium">{funnel.name}</div>
                                  {funnel.description && (
                                    <div className="text-xs text-[color:var(--color-text-secondary)]">{funnel.description}</div>
                                  )}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                    {mainFunnelLoading && (
                      <span className="text-xs text-[color:var(--color-text-muted)]">分析中...</span>
                    )}
                  </div>

                  {mainFunnelError && (
                    <p className="mt-3 text-xs text-[color:var(--color-danger)]">{mainFunnelError}</p>
                  )}

                  {mainFunnelResult && !mainFunnelLoading && (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full min-w-[720px]">
                        <thead>
                          <tr className="border-b border-[color:var(--color-border)] bg-gray-50 text-left text-xs uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                            <th className="px-4 py-3">#</th>
                            <th className="px-4 py-3">ステップ</th>
                            <th className="px-4 py-3 text-right">到達人数</th>
                            <th className="px-4 py-3 text-right">未到達人数</th>
                            <th className="px-4 py-3 text-right">移行率</th>
                            <th className="px-4 py-3 text-right">全体比</th>
                            <th className="px-4 py-3">視覚化</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[color:var(--color-border)] text-sm">
                          {mainFunnelResult.steps.map((step, index) => {
                            const isFirst = index === 0;
                            const conversionColor =
                              step.conversionRate >= 50
                                ? 'text-green-600'
                                : step.conversionRate >= 20
                                  ? 'text-yellow-600'
                                  : 'text-red-600';

                            return (
                              <tr key={step.stepId} className="hover:bg-[color:var(--color-surface-muted)]">
                                <td className="px-4 py-3 text-[color:var(--color-text-secondary)]">{index}</td>
                                <td className="px-4 py-3">
                                  <div className="font-medium text-[color:var(--color-text-primary)]">{step.label}</div>
                                </td>
                                <td className="px-4 py-3 text-right font-semibold text-[color:var(--color-text-primary)]">
                                  {formatNumber(step.reached)}
                                </td>
                                <td className="px-4 py-3 text-right text-[color:var(--color-text-secondary)]">
                                  {isFirst ? '-' : formatNumber(step.notReached)}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {isFirst ? (
                                    <span className="text-[color:var(--color-text-secondary)]">-</span>
                                  ) : (
                                    <span className={conversionColor}>{formatPercent(step.conversionRate)}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right text-[color:var(--color-text-secondary)]">
                                  {formatPercent(step.overallRate)}
                                </td>
                                <td className="px-4 py-3">
                                  <div className="h-6 w-full overflow-hidden rounded bg-gray-100">
                                    <div
                                      className="h-full bg-green-500 transition-all"
                                      style={{ width: `${step.overallRate}%` }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              )}

              {/* 期間比較ファネル分析（独立セクション） */}
              {mainFunnelList.length > 0 && (
                <Card className="p-6 space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">期間比較ファネル分析</h2>
                      <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                        2つの期間を比較して、ファネルの変化を分析します。
                      </p>
                    </div>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMainFunnelDropdownOpen(!mainFunnelDropdownOpen)}
                        className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-1.5 text-sm font-medium text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-surface-muted)] transition"
                      >
                        {mainFunnelList.find(f => f.id === selectedMainFunnelId)?.name ?? 'ファネルを選択'}
                        <svg
                          className={`h-4 w-4 transition-transform ${mainFunnelDropdownOpen ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {mainFunnelDropdownOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setMainFunnelDropdownOpen(false)}
                          />
                          <div className="absolute top-full right-0 z-20 mt-1 min-w-[200px] rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white py-1 shadow-lg">
                            {mainFunnelList.map((funnel) => (
                              <button
                                key={funnel.id}
                                type="button"
                                onClick={() => {
                                  setSelectedMainFunnelId(funnel.id);
                                  setMainFunnelDropdownOpen(false);
                                }}
                                className={`w-full px-3 py-2 text-left text-sm transition hover:bg-[color:var(--color-surface-muted)] ${
                                  funnel.id === selectedMainFunnelId
                                    ? 'bg-[color:var(--color-accent-muted)] text-[color:var(--color-accent-dark)]'
                                    : 'text-[color:var(--color-text-primary)]'
                                }`}
                              >
                                <div className="font-medium">{funnel.name}</div>
                                {funnel.description && (
                                  <div className="text-xs text-[color:var(--color-text-secondary)]">{funnel.description}</div>
                                )}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* 期間設定 */}
                  <div className="grid gap-6 md:grid-cols-2">
                    {/* A期間 */}
                    <div className="space-y-3 p-4 rounded-[var(--radius-md)] bg-blue-50 border border-blue-200">
                      <h4 className="text-sm font-semibold text-blue-700">A期間（過去）</h4>
                      <div className="grid gap-2 grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-blue-600">開始日</span>
                          <input
                            type="date"
                            value={mainPeriodAStart}
                            onChange={(e) => setMainPeriodAStart(e.target.value)}
                            className="rounded-[var(--radius-sm)] border border-blue-300 px-2 py-1.5 text-sm"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-blue-600">終了日</span>
                          <input
                            type="date"
                            value={mainPeriodAEnd}
                            onChange={(e) => setMainPeriodAEnd(e.target.value)}
                            className="rounded-[var(--radius-sm)] border border-blue-300 px-2 py-1.5 text-sm"
                          />
                        </label>
                      </div>
                    </div>

                    {/* B期間 */}
                    <div className="space-y-3 p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200">
                      <h4 className="text-sm font-semibold text-green-700">B期間（最近）</h4>
                      <div className="grid gap-2 grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-green-600">開始日</span>
                          <input
                            type="date"
                            value={mainPeriodBStart}
                            onChange={(e) => setMainPeriodBStart(e.target.value)}
                            className="rounded-[var(--radius-sm)] border border-green-300 px-2 py-1.5 text-sm"
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-green-600">終了日</span>
                          <input
                            type="date"
                            value={mainPeriodBEnd}
                            onChange={(e) => setMainPeriodBEnd(e.target.value)}
                            className="rounded-[var(--radius-sm)] border border-green-300 px-2 py-1.5 text-sm"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={runMainComparison}
                      disabled={mainComparisonLoading}
                      className="px-4 py-2 bg-gray-900 text-white rounded-[var(--radius-sm)] text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
                    >
                      {mainComparisonLoading ? '分析中...' : '比較分析を実行'}
                    </button>
                  </div>

                  {mainComparisonError && (
                    <p className="text-sm text-[color:var(--color-danger)]">エラー: {mainComparisonError}</p>
                  )}

                  {/* 比較結果 */}
                  {mainComparisonResultA && mainComparisonResultB && (
                    <div className="space-y-4">
                      {/* サマリー */}
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="p-4 rounded-[var(--radius-md)] bg-blue-50 border border-blue-200">
                          <p className="text-xs font-medium text-blue-600 mb-2">A期間: {mainPeriodAStart} 〜 {mainPeriodAEnd}</p>
                          <p className="text-2xl font-bold text-blue-700">{formatNumber(mainComparisonResultA.totalBase)}人</p>
                          <p className="text-xs text-blue-600">計測対象</p>
                        </div>
                        <div className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200">
                          <p className="text-xs font-medium text-green-600 mb-2">B期間: {mainPeriodBStart} 〜 {mainPeriodBEnd}</p>
                          <p className="text-2xl font-bold text-green-700">{formatNumber(mainComparisonResultB.totalBase)}人</p>
                          <p className="text-xs text-green-600">計測対象</p>
                          {(() => {
                            const diff = mainComparisonResultB.totalBase - mainComparisonResultA.totalBase;
                            const pct = mainComparisonResultA.totalBase > 0 ? (diff / mainComparisonResultA.totalBase) * 100 : 0;
                            return (
                              <p className={`text-xs mt-1 ${diff >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {diff >= 0 ? '+' : ''}{formatNumber(diff)} ({diff >= 0 ? '+' : ''}{formatPercent(pct)})
                              </p>
                            );
                          })()}
                        </div>
                      </div>

                      {/* 比較テーブル */}
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[1000px]">
                          <thead>
                            <tr className="border-b border-[color:var(--color-border)] bg-gray-50">
                              <th className="px-3 py-3 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">#</th>
                              <th className="px-3 py-3 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">ステップ</th>
                              <th className="px-3 py-3 text-center text-xs font-medium text-blue-600 bg-blue-50" colSpan={3}>A期間</th>
                              <th className="w-4"></th>
                              <th className="px-3 py-3 text-center text-xs font-medium text-green-600 bg-green-50" colSpan={3}>B期間</th>
                              <th className="px-3 py-3 text-center text-xs font-medium text-[color:var(--color-text-secondary)]" colSpan={2}>差分</th>
                            </tr>
                            <tr className="border-b border-[color:var(--color-border)] bg-gray-50 text-xs">
                              <th className="px-3 py-2"></th>
                              <th className="px-3 py-2"></th>
                              <th className="px-3 py-2 text-right text-blue-600 bg-blue-50">到達数</th>
                              <th className="px-3 py-2 text-right text-blue-600 bg-blue-50">移行率</th>
                              <th className="px-3 py-2 text-right text-blue-600 bg-blue-50">全体比</th>
                              <th className="w-4"></th>
                              <th className="px-3 py-2 text-right text-green-600 bg-green-50">到達数</th>
                              <th className="px-3 py-2 text-right text-green-600 bg-green-50">移行率</th>
                              <th className="px-3 py-2 text-right text-green-600 bg-green-50">全体比</th>
                              <th className="px-3 py-2 text-right">移行率差</th>
                              <th className="px-3 py-2 text-right">全体比差</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[color:var(--color-border)] text-sm">
                            {mainComparisonResultA.steps.map((stepA, index) => {
                              const stepB = mainComparisonResultB.steps[index];
                              if (!stepB) return null;
                              const isFirst = index === 0;
                              const rateDiff = stepB.conversionRate - stepA.conversionRate;
                              const overallDiff = stepB.overallRate - stepA.overallRate;

                              return (
                                <tr key={stepA.stepId} className="hover:bg-[color:var(--color-surface-muted)]">
                                  <td className="px-3 py-3 text-[color:var(--color-text-secondary)]">{index}</td>
                                  <td className="px-3 py-3 font-medium text-[color:var(--color-text-primary)]">
                                    {stepA.label}
                                  </td>
                                  <td className="px-3 py-3 text-right bg-blue-50/50">{formatNumber(stepA.reached)}</td>
                                  <td className="px-3 py-3 text-right bg-blue-50/50">
                                    {isFirst ? '-' : formatPercent(stepA.conversionRate)}
                                  </td>
                                  <td className="px-3 py-3 text-right bg-blue-50/50">
                                    {formatPercent(stepA.overallRate)}
                                  </td>
                                  <td className="w-4"></td>
                                  <td className="px-3 py-3 text-right bg-green-50/50">{formatNumber(stepB.reached)}</td>
                                  <td className="px-3 py-3 text-right bg-green-50/50">
                                    {isFirst ? '-' : formatPercent(stepB.conversionRate)}
                                  </td>
                                  <td className="px-3 py-3 text-right bg-green-50/50">
                                    {formatPercent(stepB.overallRate)}
                                  </td>
                                  <td className="px-3 py-3 text-right">
                                    {isFirst ? (
                                      '-'
                                    ) : (
                                      <span className={rateDiff >= 0 ? 'text-green-600' : 'text-red-600'}>
                                        {rateDiff >= 0 ? '+' : ''}{formatPercent(rateDiff)}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-3 text-right">
                                    {isFirst ? (
                                      '-'
                                    ) : (
                                      <span className={overallDiff >= 0 ? 'text-green-600' : 'text-red-600'}>
                                        {overallDiff >= 0 ? '+' : ''}{formatPercent(overallDiff)}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* 全体比の視覚的な比較（左右分割） */}
                      <div>
                        <h4 className="text-sm font-semibold text-[color:var(--color-text-primary)] mb-4">全体比の比較</h4>
                        <div className="grid gap-6 md:grid-cols-2">
                          {/* A期間 */}
                          <div className="p-4 rounded-[var(--radius-md)] bg-blue-50 border border-blue-200">
                            <h5 className="text-sm font-semibold text-blue-700 mb-3">A期間</h5>
                            <div className="space-y-3">
                              {mainComparisonResultA.steps.map((step, index) => (
                                <div key={step.stepId} className="space-y-1">
                                  <div className="flex justify-between text-xs">
                                    <span className="text-blue-700">{index}. {step.label}</span>
                                    <span className="font-semibold text-blue-800">{formatPercent(step.overallRate)}</span>
                                  </div>
                                  <div className="h-4 bg-blue-100 rounded overflow-hidden">
                                    <div
                                      className="h-full bg-blue-500 transition-all"
                                      style={{ width: `${step.overallRate}%` }}
                                    />
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* B期間 */}
                          <div className="p-4 rounded-[var(--radius-md)] bg-green-50 border border-green-200">
                            <h5 className="text-sm font-semibold text-green-700 mb-3">B期間</h5>
                            <div className="space-y-3">
                              {mainComparisonResultB.steps.map((step, index) => {
                                const stepA = mainComparisonResultA.steps[index];
                                const diff = stepA ? step.overallRate - stepA.overallRate : 0;
                                return (
                                  <div key={step.stepId} className="space-y-1">
                                    <div className="flex justify-between text-xs">
                                      <span className="text-green-700">{index}. {step.label}</span>
                                      <span className="font-semibold text-green-800">
                                        {formatPercent(step.overallRate)}
                                        {index > 0 && (
                                          <span className={`ml-2 ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            ({diff >= 0 ? '+' : ''}{formatPercent(diff)})
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                    <div className="h-4 bg-green-100 rounded overflow-hidden">
                                      <div
                                        className="h-full bg-green-500 transition-all"
                                        style={{ width: `${step.overallRate}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              )}

              {/* 属性分析（一番下に移動） */}
              <Card className="p-6">
                <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">属性分析</h2>

                {/* 性別セクション - 2カラムレイアウト */}
                <div className="mt-6">
                  <h3 className="text-base font-semibold text-[color:var(--color-text-primary)] mb-4">性別</h3>
                  {genderData.length === 0 ? (
                    <p className="text-sm text-[color:var(--color-text-muted)]">データがありません。</p>
                  ) : (
                    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] items-center">
                      {/* 左: 人数表示 */}
                      <div className="space-y-3 w-full">
                        {genderData.map((item) => (
                          <div key={item.name} className="flex items-center gap-3">
                            <div className="w-12 text-sm text-[color:var(--color-text-secondary)] font-medium">{item.name}</div>
                            <div className="flex-1 h-7 rounded-[var(--radius-sm)] bg-[color:var(--color-surface-muted)] overflow-hidden">
                              <div
                                className="h-full rounded-[var(--radius-sm)] transition-all duration-300"
                                style={{
                                  width: `${Math.min(100, Math.max(0, item.percent))}%`,
                                  backgroundColor: item.name === '男性' ? '#0a7aff' : '#ff6b9d',
                                }}
                              />
                            </div>
                            <div className="w-16 text-right text-sm font-semibold text-[color:var(--color-text-primary)]">
                              {formatNumber(item.value)}人
                            </div>
                          </div>
                        ))}
                        <div className="text-xs text-[color:var(--color-text-muted)] pl-12">
                          合計: {formatNumber(genderData.reduce((sum, item) => sum + item.value, 0))}人
                        </div>
                      </div>

                      {/* 右: 円グラフ + 凡例 */}
                      <div className="flex items-center gap-4 justify-center lg:justify-start">
                        <div className="w-[150px] h-[150px] relative flex-shrink-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={genderData}
                                cx="50%"
                                cy="50%"
                                innerRadius={38}
                                outerRadius={68}
                                paddingAngle={2}
                                dataKey="value"
                              >
                                {genderData.map((entry, index) => (
                                  <Cell
                                    key={`cell-${index}`}
                                    fill={entry.name === '男性' ? '#0a7aff' : '#ff6b9d'}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: number, name: string) => [
                                  `${formatNumber(value)}人`,
                                  name,
                                ]}
                                contentStyle={{
                                  backgroundColor: 'var(--color-surface)',
                                  border: '1px solid var(--color-border)',
                                  borderRadius: 'var(--radius-md)',
                                  fontSize: '12px',
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-xs text-[color:var(--color-text-muted)]">男女比</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {genderData.map((item) => (
                            <div key={item.name} className="flex items-center gap-2">
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: item.name === '男性' ? '#0a7aff' : '#ff6b9d' }}
                              />
                              <span className="text-sm text-[color:var(--color-text-secondary)] whitespace-nowrap">
                                {item.name}: {formatPercent(item.percent)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 他の属性 */}
                <div className="mt-8 grid gap-6 lg:grid-cols-2">
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
            <div className="space-y-6">
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

          {activeTab === 'custom_funnel' ? (
            <LineFunnelsManager
              startDate={(() => {
                const rangePreset = isUnifiedRangePreset(dateRange) ? dateRange : '7d';
                const resolved = resolveDateRange(rangePreset, customStartDate, customEndDate);
                const adjusted = adjustRangeWithSnapshot(resolved.start, resolved.end, initialData.latestSnapshotDate);
                return formatDateInput(adjusted.start);
              })()}
              endDate={(() => {
                const rangePreset = isUnifiedRangePreset(dateRange) ? dateRange : '7d';
                const resolved = resolveDateRange(rangePreset, customStartDate, customEndDate);
                const adjusted = adjustRangeWithSnapshot(resolved.start, resolved.end, initialData.latestSnapshotDate);
                return formatDateInput(adjusted.end);
              })()}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
