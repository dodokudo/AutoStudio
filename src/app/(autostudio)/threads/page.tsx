import { getThreadsInsights, type ThreadsInsightsOptions } from "@/lib/threadsInsights";
import { getLightweightInsights } from "@/lib/threadsAccountSummary";
import { listPlanSummaries, seedPlansIfNeeded } from "@/lib/bigqueryPlans";
import { getThreadsDashboard } from "@/lib/threadsDashboard";
import { getThreadsInsightsData, getDailyPostStats } from "@/lib/threadsInsightsData";
import { resolveProjectId } from "@/lib/bigquery";
import { PostTab } from "./_components/post-tab";
import { InsightsTab } from "./_components/insights-tab";
import { CompetitorTabLight } from "./_components/competitor-tab-light";
import { ReportTab } from "./_components/report-tab";
import { ScheduleTab } from "./_components/schedule-tab";
import { InsightsRangeSelector } from "./_components/insights-range-selector";
import { countLineSourceRegistrations, listLineSourceRegistrations } from "@/lib/lstep/dashboard";
import { getLinkClicksSummary, getThreadsLinkClicksByRange } from "@/lib/links/analytics";
import { ThreadsTabShell } from "./_components/threads-tab-shell";
import { UNIFIED_RANGE_OPTIONS, resolveDateRange, isUnifiedRangePreset, formatDateInput, type UnifiedRangePreset } from "@/lib/dateRangePresets";

const PROJECT_ID = resolveProjectId();

const RANGE_SELECT_OPTIONS = UNIFIED_RANGE_OPTIONS;

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

type ThreadsTabKey = 'post' | 'schedule' | 'insights' | 'competitor' | 'report';

export default async function ThreadsHome({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const resolvedSearchParams = await searchParams;
  const rangeParam = typeof resolvedSearchParams?.range === "string" ? resolvedSearchParams.range : undefined;
  const startParam = typeof resolvedSearchParams?.start === "string" ? resolvedSearchParams.start : undefined;
  const endParam = typeof resolvedSearchParams?.end === "string" ? resolvedSearchParams.end : undefined;
  const selectedRangeValue: UnifiedRangePreset = isUnifiedRangePreset(rangeParam) ? rangeParam : '7d';
  const resolvedRange = resolveDateRange(selectedRangeValue, startParam, endParam);
  const rangeValueForUi = resolvedRange.preset;
  const customStart = rangeValueForUi === 'custom' ? formatDateInput(resolvedRange.start) : startParam;
  const customEnd = rangeValueForUi === 'custom' ? formatDateInput(resolvedRange.end) : endParam;
  const selectedRangeWindow = { start: resolvedRange.start, end: resolvedRange.end };

  const noteText =
    resolvedRange.preset === 'all'
      ? 'レポート期間: 全期間'
      : `レポート期間: ${formatDateInput(resolvedRange.start)} 〜 ${formatDateInput(resolvedRange.end)}`;

  const insightsOptions: ThreadsInsightsOptions = {
    startDate: formatDateInput(resolvedRange.start),
    endDate: formatDateInput(resolvedRange.end),
  };

  const tabParamRaw = typeof resolvedSearchParams?.tab === "string" ? resolvedSearchParams.tab : undefined;
  const normalizedTabParam = tabParamRaw === 'overview' ? 'insights' : tabParamRaw;
  const allowedTabs: ThreadsTabKey[] = ['insights', 'post', 'schedule', 'competitor', 'report'];
  const activeTab: ThreadsTabKey = allowedTabs.find((tab) => tab === normalizedTabParam) ?? 'insights';

  try {
    const { start: rangeStartDate, end: rangeEndDate } = selectedRangeWindow;

    const durationMs = Math.max(rangeEndDate.getTime() - rangeStartDate.getTime(), DAY_MS);
    const previousRangeEnd = new Date(rangeStartDate.getTime() - 1);
    const previousRangeStart = new Date(previousRangeEnd.getTime() - durationMs);
    const postsQueryStartKey = formatDateInput(previousRangeStart);
    const postsQueryEndKey = formatDateInput(rangeEndDate);

    // タブごとに必要なデータだけ取得（投稿タブと競合タブでは重いデータを取らない）
    const needsFullInsights = activeTab === 'insights';

    const [
      insights,
      lightweightInsights,
      planSummaries,
      dashboard,
      insightsActivity,
      currentClicks,
      previousClicks,
      dailyPostStats,
      previousDailyPostStats,
    ] = await Promise.all([
      needsFullInsights ? getThreadsInsights(PROJECT_ID, insightsOptions) : Promise.resolve(null),
      !needsFullInsights ? getLightweightInsights(PROJECT_ID, insightsOptions) : Promise.resolve(null),
      (async () => {
        await seedPlansIfNeeded();
        return listPlanSummaries();
      })(),
      getThreadsDashboard(),
      getThreadsInsightsData({
        startDate: postsQueryStartKey,
        endDate: postsQueryEndKey,
      }),
      getLinkClicksSummary({ startDate: rangeStartDate, endDate: rangeEndDate }),
      getLinkClicksSummary({ startDate: previousRangeStart, endDate: previousRangeEnd }),
      // 日別集計クエリ（軽量）- チャート・概要用
      getDailyPostStats({
        startDate: formatDateInput(rangeStartDate),
        endDate: formatDateInput(rangeEndDate),
      }),
      getDailyPostStats({
        startDate: formatDateInput(previousRangeStart),
        endDate: formatDateInput(previousRangeEnd),
      }),
    ]);

    // 投稿タブ用のデータを統合
    const effectiveAccountSummary = insights?.accountSummary ?? lightweightInsights?.accountSummary ?? {
      averageFollowers: 0,
      averageProfileViews: 0,
      totalProfileViews: 0,
      followersChange: 0,
      profileViewsChange: 0,
      recentDates: [],
    };
    const effectiveTemplateSummaries = insights?.templateSummaries ?? lightweightInsights?.templateSummaries ?? [];
    const effectivePostCount = insights?.postCount ?? lightweightInsights?.postCount ?? 0;

    let lineRegistrationCount: number | null = null;
    let previousLineRegistrationCount: number | null = null;
    let linkClicksForRange: number | null = null;
    let previousLinkClicks: number | null = null;

    // 日別集計データから投稿数・インプレッションを計算（正確な値）
    const postsCountForRange = dailyPostStats.reduce((sum, d) => sum + d.postCount, 0);
    const previousPostsCount = previousDailyPostStats.reduce((sum, d) => sum + d.postCount, 0);
    const profileViewsForRange = dailyPostStats.reduce((sum, d) => sum + d.impressions, 0);
    const previousProfileViews = previousDailyPostStats.reduce((sum, d) => sum + d.impressions, 0);

    if (selectedRangeWindow) {
      const rangeStartKey = formatDateInput(rangeStartDate);
      const rangeEndKey = formatDateInput(rangeEndDate);

      try {
        const previousRangeStartKey = formatDateInput(previousRangeStart);
        const previousRangeEndKey = formatDateInput(previousRangeEnd);

        const [currentLineCount, prevLineCount] = await Promise.all([
          countLineSourceRegistrations(PROJECT_ID, {
            startDate: rangeStartKey,
            endDate: rangeEndKey,
            sourceName: 'Threads',
          }),
          countLineSourceRegistrations(PROJECT_ID, {
            startDate: previousRangeStartKey,
            endDate: previousRangeEndKey,
            sourceName: 'Threads',
          }),
        ]);
        lineRegistrationCount = currentLineCount;
        previousLineRegistrationCount = prevLineCount;
      } catch (lineError) {
        console.error('[threads/page] Failed to load LINE registrations:', lineError);
      }

      // Threadsカテゴリのみのクリックを取得
      const currentThreadsClicks = currentClicks.byCategory?.find((item) => item.category === 'threads')?.clicks ?? null;
      const previousThreadsClicks = previousClicks.byCategory?.find((item) => item.category === 'threads')?.clicks ?? null;
      linkClicksForRange = currentThreadsClicks;
      previousLinkClicks = previousThreadsClicks;
    }

    if (lineRegistrationCount === null) {
      try {
        lineRegistrationCount = await countLineSourceRegistrations(PROJECT_ID, {
          sourceName: 'Threads',
        });
      } catch (lineError) {
        console.error('[threads/page] Failed to load default LINE registrations:', lineError);
      }
    }

    const resolveDeltaTone = (value: number | undefined): 'up' | 'down' | 'neutral' | undefined => {
      if (value === undefined) return undefined;
      if (value === 0) return 'neutral';
      return value > 0 ? 'up' : 'down';
    };

    const formatNumber = (value?: number | null) =>
      typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : 'N/A';

    const safeDivide = (numerator?: number | null, denominator?: number | null) => {
      const numeratorValue = typeof numerator === 'number' && Number.isFinite(numerator) ? numerator : null;
      const denominatorValue = typeof denominator === 'number' && Number.isFinite(denominator) ? denominator : null;
      if (!denominatorValue || denominatorValue === 0) {
        return null;
      }
      return (numeratorValue ?? 0) / denominatorValue;
    };

    const formatPercent = (value: number | null, fractionDigits = 1) => {
      if (value === null) {
        return 'N/A';
      }
      return new Intl.NumberFormat('ja-JP', {
        style: 'percent',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      }).format(value);
    };

    const profileViewsDisplayValue = profileViewsForRange;

    const profileViewsDeltaValue = profileViewsForRange - previousProfileViews;

    const profileViewsDelta =
      profileViewsDeltaValue === undefined || profileViewsDeltaValue === null || profileViewsDeltaValue === 0
        ? undefined
        : `${profileViewsDeltaValue > 0 ? '+' : ''}${formatNumber(profileViewsDeltaValue)}`;

    const profileViewsDeltaTone =
      profileViewsDeltaValue === undefined || profileViewsDeltaValue === null
        ? undefined
        : resolveDeltaTone(profileViewsDeltaValue);


    const profileViewsNumeric = profileViewsForRange;

    // フォロワー増減は期間内のdailyMetricsで算出（Threadsタブ基準）
    const sortedDailyMetrics = [...insightsActivity.dailyMetrics].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    const firstPoint = sortedDailyMetrics.find((m) => {
      const d = new Date(`${m.date}T00:00:00Z`);
      return d >= rangeStartDate && d <= rangeEndDate;
    });
    const lastPoint = [...sortedDailyMetrics].reverse().find((m) => {
      const d = new Date(`${m.date}T00:00:00Z`);
      return d >= rangeStartDate && d <= rangeEndDate;
    });
    const followersStart = firstPoint?.followers ?? sortedDailyMetrics.at(-1)?.followers ?? null;
    const followersEnd = lastPoint?.followers ?? sortedDailyMetrics[0]?.followers ?? null;
    const followerDeltaValue =
      followersStart !== null && followersEnd !== null ? followersEnd - followersStart : effectiveAccountSummary.followersChange;

    const lineRegistrationsNumeric =
      typeof lineRegistrationCount === 'number' && Number.isFinite(lineRegistrationCount)
        ? lineRegistrationCount
        : null;

    const totalLinkClicks = linkClicksForRange;
    const linkClicksDeltaValue =
      previousLinkClicks !== null && totalLinkClicks !== null ? totalLinkClicks - previousLinkClicks : null;

    const postsDeltaValue = postsCountForRange - previousPostsCount;

    const linkClickConversionRate = safeDivide(totalLinkClicks, profileViewsNumeric);
    const lineRegistrationConversionRate = safeDivide(lineRegistrationsNumeric, totalLinkClicks);

    const rangeDurationDays = Math.max(1, Math.round((selectedRangeWindow.end.getTime() - selectedRangeWindow.start.getTime()) / DAY_MS) + 1);

    const postsPerDay = rangeDurationDays ? postsCountForRange / rangeDurationDays : null;

    const postsDeltaParts = [
      `${postsDeltaValue > 0 ? '+' : ''}${formatNumber(postsDeltaValue)}投稿`,
      postsPerDay !== null ? `${postsPerDay.toFixed(1)}件` : null,
    ].filter((part): part is string => Boolean(part));

    const lineRegistrationDeltaValue =
      previousLineRegistrationCount !== null && lineRegistrationCount !== null
        ? lineRegistrationCount - previousLineRegistrationCount
        : null;

    const linkClicksDeltaParts = [
      linkClickConversionRate !== null ? `遷移率: ${formatPercent(linkClickConversionRate, 2)}` : null,
      linkClicksDeltaValue !== null && linkClicksDeltaValue !== 0
        ? `${linkClicksDeltaValue > 0 ? '+' : ''}${formatNumber(linkClicksDeltaValue)}`
        : null,
    ].filter((part): part is string => Boolean(part));

    const lineRegistrationDeltaParts = [
      lineRegistrationConversionRate !== null ? `遷移率: ${formatPercent(lineRegistrationConversionRate, 2)}` : null,
      lineRegistrationDeltaValue !== null && lineRegistrationDeltaValue !== 0
        ? `${lineRegistrationDeltaValue > 0 ? '+' : ''}${formatNumber(lineRegistrationDeltaValue)}`
        : null,
    ].filter((part): part is string => Boolean(part));

    const stats = [
      {
        label: '現在のフォロワー数',
        value: formatNumber(effectiveAccountSummary.averageFollowers),
        delta:
          followerDeltaValue === null || followerDeltaValue === 0
            ? undefined
            : `${followerDeltaValue > 0 ? '+' : ''}${formatNumber(followerDeltaValue)}`,
        deltaTone: resolveDeltaTone(followerDeltaValue ?? undefined),
      },
      {
        label: '投稿数',
        value: formatNumber(postsCountForRange),
        delta: postsDeltaParts.length ? postsDeltaParts.join(' / ') : undefined,
        deltaTone: resolveDeltaTone(postsDeltaValue) ?? 'neutral',
      },
      {
        label: '閲覧数',
        value: formatNumber(profileViewsDisplayValue),
        delta: profileViewsDelta,
        deltaTone: profileViewsDeltaTone,
      },
      {
        label: 'リンククリック数',
        value: formatNumber(totalLinkClicks),
        delta: linkClicksDeltaParts.length ? linkClicksDeltaParts.join(' / ') : undefined,
        deltaTone: resolveDeltaTone(linkClicksDeltaValue ?? undefined),
      },
      {
        label: 'LINE登録数',
        value: formatNumber(lineRegistrationCount),
        delta: lineRegistrationDeltaParts.length ? lineRegistrationDeltaParts.join(' / ') : undefined,
        deltaTone: resolveDeltaTone(lineRegistrationDeltaValue ?? undefined),
      },
    ];

    const chartWindowStart = rangeStartDate;
    const chartWindowEnd = rangeEndDate;

    const sortedDailyMetricsForChart = [...insightsActivity.dailyMetrics].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    const filteredDailyMetrics = sortedDailyMetricsForChart.filter((metric) => {
      const metricDate = new Date(`${metric.date}T00:00:00Z`);
      return metricDate.getTime() >= chartWindowStart.getTime() && metricDate.getTime() <= chartWindowEnd.getTime();
    });

    const dailyMetricsForChart = filteredDailyMetrics.length ? filteredDailyMetrics : sortedDailyMetricsForChart;

    // 日別集計データをマップに変換（正確な値）
    const impressionsByDate = dailyPostStats.reduce<Record<string, number>>((acc, stat) => {
      acc[stat.date] = stat.impressions;
      return acc;
    }, {});

    const postCountByDate = dailyPostStats.reduce<Record<string, number>>((acc, stat) => {
      acc[stat.date] = stat.postCount;
      return acc;
    }, {});

    // Threads経由のLINE登録数を日別で取得
    let lineRegistrationsByDate: Record<string, number> = {};
    try {
      const lineRegistrationSeries = await listLineSourceRegistrations(PROJECT_ID, {
        sourceName: 'Threads',
        startDate: formatDateInput(chartWindowStart),
        endDate: formatDateInput(chartWindowEnd),
      });
      lineRegistrationsByDate = lineRegistrationSeries.reduce<Record<string, number>>((acc, point) => {
        acc[point.date] = point.count;
        return acc;
      }, {});
    } catch (lineError) {
      console.error('[threads/page] Failed to load LINE registration series:', lineError);
    }

    // Threadsカテゴリのリンククリック数を日別で取得
    let linkClicksByDate: Record<string, number> = {};
    try {
      const linkClicksSeries = await getThreadsLinkClicksByRange(chartWindowStart, chartWindowEnd);
      linkClicksByDate = linkClicksSeries.reduce<Record<string, number>>((acc, point) => {
        acc[point.date] = point.clicks;
        return acc;
      }, {});
    } catch (linkError) {
      console.error('[threads/page] Failed to load link clicks series:', linkError);
    }

    let performanceSeries = dailyMetricsForChart.map((metric, index) => {
      const previousFollowers = index > 0 ? dailyMetricsForChart[index - 1].followers : metric.followers;
      const rawFollowerDelta = index === 0 ? 0 : metric.followers - previousFollowers;
      const followerDelta = rawFollowerDelta > 0 ? rawFollowerDelta : 0;
      return {
        date: metric.date,
        followers: metric.followers,
        impressions: impressionsByDate[metric.date] ?? 0,
        followerDelta,
        linkClicks: linkClicksByDate[metric.date] ?? 0,
        lineRegistrations: lineRegistrationsByDate[metric.date] ?? 0,
        postCount: postCountByDate[metric.date] ?? 0,
      };
    });

    if (performanceSeries.length === 0) {
      const impressionDates = Object.keys(impressionsByDate)
        .filter((date) => {
          const metricDate = new Date(`${date}T00:00:00Z`);
          return metricDate.getTime() >= chartWindowStart.getTime() && metricDate.getTime() <= chartWindowEnd.getTime();
        })
        .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

      performanceSeries = impressionDates.map((date) => ({
        date,
        followers: 0,
        impressions: impressionsByDate[date] ?? 0,
        followerDelta: 0,
        linkClicks: linkClicksByDate[date] ?? 0,
        lineRegistrations: lineRegistrationsByDate[date] ?? 0,
        postCount: postCountByDate[date] ?? 0,
      }));
    }

    const trimmedPerformanceSeries = performanceSeries.slice(-30);
    const maxImpressionsValue = trimmedPerformanceSeries.reduce(
      (max, item) => Math.max(max, item.impressions),
      0,
    );
    const maxFollowerDeltaValue = trimmedPerformanceSeries.reduce(
      (max, item) => Math.max(max, item.followerDelta),
      0,
    );



    const templateOptions =
      effectiveTemplateSummaries?.map((template) => ({
        value: template.templateId,
        label: `${template.templateId} (v${template.version})`,
      })) || [];

    const rangeSelectorOptions = RANGE_SELECT_OPTIONS;

    const sharedParams = new URLSearchParams();
    if (rangeValueForUi) sharedParams.set('range', rangeValueForUi);
    if (rangeValueForUi === 'custom') {
      if (customStart) sharedParams.set('start', customStart);
      if (customEnd) sharedParams.set('end', customEnd);
    }

    const tabItems = (
      [
        { id: 'insights' as ThreadsTabKey, label: 'インサイト' },
        { id: 'post' as ThreadsTabKey, label: '投稿' },
        { id: 'schedule' as ThreadsTabKey, label: '予約投稿' },
        { id: 'competitor' as ThreadsTabKey, label: '競合インサイト' },
        { id: 'report' as ThreadsTabKey, label: 'レポート' },
      ] satisfies Array<{ id: ThreadsTabKey; label: string }>
    ).map((item) => {
      const params = new URLSearchParams(sharedParams.toString());
      params.set('tab', item.id);
      return {
        id: item.id,
        label: item.label,
        href: `?${params.toString()}`,
      };
    });

    return (
      <ThreadsTabShell
        tabItems={tabItems}
        activeTab={activeTab}
        rangeSelector={
          <InsightsRangeSelector
            options={rangeSelectorOptions}
            value={rangeValueForUi}
            customStart={customStart}
            customEnd={customEnd}
          />
        }
      >
        {activeTab === 'post' ? (
          <PostTab
            planSummaries={planSummaries}
            templateOptions={templateOptions}
            recentLogs={dashboard.recentLogs as Array<Record<string, unknown>>}
          />
        ) : activeTab === 'schedule' ? (
          <ScheduleTab />
        ) : activeTab === 'insights' ? (
          <InsightsTab
            selectedRangeValue={rangeValueForUi}
            customStart={customStart}
            customEnd={customEnd}
            noteText={noteText}
            stats={stats}
            performanceSeries={trimmedPerformanceSeries}
            maxImpressions={maxImpressionsValue}
            maxFollowerDelta={maxFollowerDeltaValue}
          />
        ) : activeTab === 'competitor' ? (
          <CompetitorTabLight
            startDate={formatDateInput(resolvedRange.start)}
            endDate={formatDateInput(resolvedRange.end)}
          />
        ) : (
          <ReportTab />
        )}
      </ThreadsTabShell>
    );
  } catch (error) {
    console.error('[threads/page] Error occurred:', error);
    if (error instanceof Error) {
      console.error('[threads/page] Error message:', error.message);
      console.error('[threads/page] Error stack:', error.stack);
    }
    return (
      <div className="section-stack p-8">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Threads 自動投稿管理</h1>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 shadow">
          <h3 className="text-sm font-medium text-rose-700">エラーが発生しました</h3>
          <div className="mt-2 text-sm text-rose-600">
            <p>ページの読み込み中にエラーが発生しました。しばらく待ってから再度お試しください。</p>
          </div>
        </div>
      </div>
    );
  }
}
