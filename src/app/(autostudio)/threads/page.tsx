import { getThreadsInsights, type ThreadsInsightsOptions } from "@/lib/threadsInsights";
import { listPlanSummaries, seedPlansIfNeeded } from "@/lib/bigqueryPlans";
import { getThreadsDashboard } from "@/lib/threadsDashboard";
import { getThreadsInsightsData } from "@/lib/threadsInsightsData";
import { resolveProjectId } from "@/lib/bigquery";
import { PostTab } from "./_components/post-tab";
import { InsightsTab } from "./_components/insights-tab";
import { CompetitorTab } from "./_components/competitor-tab";
import { InsightsRangeSelector } from "./_components/insights-range-selector";
import { countLineSourceRegistrations, listLineSourceRegistrations } from "@/lib/lstep/dashboard";
import { getLinkClicksSummary } from "@/lib/links/analytics";
import type { PromptCompetitorHighlight, PromptTemplateSummary, PromptTrendingTopic } from "@/types/prompt";
import { ThreadsTabShell } from "./_components/threads-tab-shell";
import { UNIFIED_RANGE_OPTIONS, resolveDateRange, isUnifiedRangePreset, formatDateInput, type UnifiedRangePreset } from "@/lib/dateRangePresets";

const PROJECT_ID = resolveProjectId();

const RANGE_SELECT_OPTIONS = UNIFIED_RANGE_OPTIONS;

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

type ThreadsTabKey = 'post' | 'insights' | 'competitor';

type DisplayHighlight = {
  accountName: string;
  username?: string;
  impressions?: string;
  likes?: string;
  summary: string;
  categories: string[];
};

type FallbackHighlight = {
  accountName: string;
  username?: string;
  impressions?: string;
  likes?: string;
  note: string;
  categories?: string[];
};

const FALLBACK_HIGHLIGHTS: FallbackHighlight[] = [
  {
    accountName: 'competitor1',
    username: 'marketing_pro',
    impressions: '12,400',
    likes: '2,180',
    note: '採用の舞台裏をストーリー形式で公開し、CTAで無料相談へ誘導。',
    categories: ['未読', '要リライト'],
  },
  {
    accountName: 'competitor2',
    username: 'startup_lab',
    impressions: '8,960',
    likes: '1,480',
    note: 'バズった要因を3つの見出しで整理。Hook → Insight → CTA の流れが秀逸。',
    categories: ['保存増', 'インサイト'],
  },
];

const FALLBACK_TRENDING: PromptTrendingTopic[] = [
  { themeTag: 'AI活用', avgFollowersDelta: 48, avgViews: 12600, sampleAccounts: ['competitor1', 'competitor2'] },
  { themeTag: 'SNS運用術', avgFollowersDelta: 32, avgViews: 9800, sampleAccounts: ['growth_studio'] },
  { themeTag: '副業Tips', avgFollowersDelta: -18, avgViews: 5400, sampleAccounts: ['biz_learn'] },
];

const FALLBACK_TEMPLATES: PromptTemplateSummary[] = [
  {
    templateId: 'Template-A',
    version: 3,
    status: 'active',
    impressionAvg72h: 2100,
    likeAvg72h: 320,
    structureNotes: 'Hookで課題→Insight→CTAの流れが安定',
  },
  {
    templateId: 'Template-B',
    version: 2,
    status: 'candidate',
    impressionAvg72h: 1680,
    likeAvg72h: 240,
    structureNotes: '導入で具体数字を入れると反応が高い',
  },
  {
    templateId: 'Template-C',
    version: 1,
    status: 'needs_review',
    impressionAvg72h: 980,
    likeAvg72h: 150,
    structureNotes: 'リードが長いので要調整',
  },
];

function toDisplayHighlight(
  item: PromptCompetitorHighlight | FallbackHighlight,
): DisplayHighlight {
  const impressions = typeof item.impressions === 'number' ? item.impressions.toLocaleString() : item.impressions;
  const likes = typeof item.likes === 'number' ? item.likes.toLocaleString() : item.likes;
  const summary = 'contentSnippet' in item ? item.contentSnippet : item.note;
  const categories = 'categories' in item && item.categories ? item.categories : [];

  return {
    accountName: item.accountName,
    username: 'username' in item ? item.username ?? undefined : undefined,
    impressions: impressions ?? undefined,
    likes: likes ?? undefined,
    summary,
    categories,
  };
}

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
  const normalizedTabParam = tabParamRaw === 'overview' ? 'post' : tabParamRaw;
  const allowedTabs: ThreadsTabKey[] = ['post', 'insights', 'competitor'];
  const activeTab: ThreadsTabKey = allowedTabs.find((tab) => tab === normalizedTabParam) ?? 'post';

  try {
    const { start: rangeStartDate, end: rangeEndDate } = selectedRangeWindow;

    const durationMs = Math.max(rangeEndDate.getTime() - rangeStartDate.getTime(), DAY_MS);
    const previousRangeEnd = new Date(rangeStartDate.getTime() - 1);
    const previousRangeStart = new Date(previousRangeEnd.getTime() - durationMs);
    const postsQueryStartKey = formatDateInput(previousRangeStart);
    const postsQueryEndKey = formatDateInput(rangeEndDate);

    const [insights, planSummaries, dashboard, insightsActivity, currentClicks, previousClicks] = await Promise.all([
      getThreadsInsights(PROJECT_ID, insightsOptions),
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
    ]);

    let lineRegistrationCount: number | null = null;
    let profileViewsForRange: number | null = null;
    let previousProfileViews: number | null = null;
    let linkClicksForRange: number | null = null;
    let previousLinkClicks: number | null = null;
    let postsCountForRange: number = insights.postCount;
    let previousPostsCount: number | null = null;

    if (selectedRangeWindow) {
      const rangeStartKey = formatDateInput(rangeStartDate);
      const rangeEndKey = formatDateInput(rangeEndDate);

      try {
        lineRegistrationCount = await countLineSourceRegistrations(PROJECT_ID, {
          startDate: rangeStartKey,
          endDate: rangeEndKey,
          sourceName: 'Threads',
        });
      } catch (lineError) {
        console.error('[threads/page] Failed to load LINE registrations:', lineError);
      }

      const sumImpressionsWithin = (windowStart: Date, windowEnd: Date) =>
        insightsActivity.posts.reduce((total, post) => {
          const postedAt = new Date(post.postedAt);
          if (Number.isNaN(postedAt.getTime())) {
            return total;
          }
          if (postedAt.getTime() >= windowStart.getTime() && postedAt.getTime() <= windowEnd.getTime()) {
            const impressions = Number(post.insights?.impressions ?? 0);
            return total + (Number.isNaN(impressions) ? 0 : impressions);
          }
          return total;
        }, 0);

      profileViewsForRange = sumImpressionsWithin(rangeStartDate, rangeEndDate);
      previousProfileViews = sumImpressionsWithin(previousRangeStart, previousRangeEnd);

      // Threadsカテゴリのみのクリックを取得
      const currentThreadsClicks = currentClicks.byCategory?.find((item) => item.category === 'threads')?.clicks ?? null;
      const previousThreadsClicks = previousClicks.byCategory?.find((item) => item.category === 'threads')?.clicks ?? null;
      linkClicksForRange = currentThreadsClicks;
      previousLinkClicks = previousThreadsClicks;

      const countPostsWithin = (windowStart: Date, windowEnd: Date) =>
        insightsActivity.posts.reduce((total, post) => {
          const postedAt = new Date(post.postedAt);
          if (Number.isNaN(postedAt.getTime())) {
            return total;
          }
          return postedAt.getTime() >= windowStart.getTime() && postedAt.getTime() <= windowEnd.getTime()
            ? total + 1
            : total;
        }, 0);

      postsCountForRange = countPostsWithin(rangeStartDate, rangeEndDate);
      previousPostsCount = countPostsWithin(previousRangeStart, previousRangeEnd);
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

    const profileViewsDisplayValue =
      profileViewsForRange !== null ? profileViewsForRange : insights.accountSummary.totalProfileViews;

    const profileViewsDeltaValue =
      profileViewsForRange !== null && previousProfileViews !== null
        ? profileViewsForRange - previousProfileViews
        : insights.accountSummary.profileViewsChange;

    const profileViewsDelta =
      profileViewsDeltaValue === undefined || profileViewsDeltaValue === null || profileViewsDeltaValue === 0
        ? undefined
        : `${profileViewsDeltaValue > 0 ? '+' : ''}${formatNumber(profileViewsDeltaValue)}`;

    const profileViewsDeltaTone =
      profileViewsDeltaValue === undefined || profileViewsDeltaValue === null
        ? undefined
        : resolveDeltaTone(profileViewsDeltaValue);


    const profileViewsNumeric =
      typeof profileViewsForRange === 'number'
        ? profileViewsForRange
        : typeof insights.accountSummary.totalProfileViews === 'number'
          ? insights.accountSummary.totalProfileViews
          : null;

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
      followersStart !== null && followersEnd !== null ? followersEnd - followersStart : insights.accountSummary.followersChange;

    const lineRegistrationsNumeric =
      typeof lineRegistrationCount === 'number' && Number.isFinite(lineRegistrationCount)
        ? lineRegistrationCount
        : null;

    const totalLinkClicks = linkClicksForRange;
    const linkClicksDeltaValue =
      previousLinkClicks !== null && totalLinkClicks !== null ? totalLinkClicks - previousLinkClicks : null;

    const postsDeltaValue =
      previousPostsCount !== null ? postsCountForRange - previousPostsCount : null;

    const linkClickConversionRate = safeDivide(totalLinkClicks, profileViewsNumeric);
    const lineRegistrationConversionRate = safeDivide(lineRegistrationsNumeric, totalLinkClicks);

    const rangeDurationDays = Math.max(1, Math.round((selectedRangeWindow.end.getTime() - selectedRangeWindow.start.getTime()) / DAY_MS) + 1);

    const postsPerDay = rangeDurationDays ? postsCountForRange / rangeDurationDays : null;

    const postsDeltaParts = [
      postsDeltaValue !== null ? `${postsDeltaValue > 0 ? '+' : ''}${formatNumber(postsDeltaValue)}投稿` : null,
      postsPerDay !== null ? `${postsPerDay.toFixed(1)}件` : null,
    ].filter((part): part is string => Boolean(part));

    const linkDeltaParts = [
      linkClickConversionRate !== null ? `遷移率: ${formatPercent(linkClickConversionRate, 2)}` : null,
      linkClicksDeltaValue !== null
        ? `前期間比 ${linkClicksDeltaValue > 0 ? '+' : ''}${formatNumber(linkClicksDeltaValue)}クリック`
        : null,
    ].filter((part): part is string => Boolean(part));

    const stats = [
      {
        label: '現在のフォロワー数',
        value: formatNumber(insights.accountSummary.averageFollowers),
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
        deltaTone:
          postsDeltaValue !== null ? resolveDeltaTone(postsDeltaValue) ?? 'neutral' : postsDeltaParts.length ? 'neutral' : undefined,
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
        delta: linkDeltaParts.length ? linkDeltaParts.join(' / ') : undefined,
        deltaTone:
          linkClicksDeltaValue !== null ? resolveDeltaTone(linkClicksDeltaValue) ?? 'neutral' : undefined,
        deltaHighlight: linkDeltaParts.length > 0,
      },
      {
        label: 'LINE登録数',
        value: formatNumber(lineRegistrationCount),
        delta:
          lineRegistrationConversionRate !== null
            ? `遷移率: ${formatPercent(lineRegistrationConversionRate, 2)}`
            : undefined,
        deltaHighlight: lineRegistrationConversionRate !== null,
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

    const impressionsByDate = insightsActivity.posts.reduce<Record<string, number>>((acc, post) => {
      const postedAt = new Date(post.postedAt);
      if (Number.isNaN(postedAt.getTime())) return acc;
      const dateKey = postedAt.toISOString().slice(0, 10);
      acc[dateKey] = (acc[dateKey] ?? 0) + (Number(post.insights?.impressions ?? 0) || 0);
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

    let performanceSeries = dailyMetricsForChart.map((metric, index) => {
      const previousFollowers = index > 0 ? dailyMetricsForChart[index - 1].followers : metric.followers;
      const rawFollowerDelta = index === 0 ? 0 : metric.followers - previousFollowers;
      const followerDelta = rawFollowerDelta > 0 ? rawFollowerDelta : 0;
      return {
        date: metric.date,
        impressions: impressionsByDate[metric.date] ?? 0,
        followerDelta,
        lineRegistrations: lineRegistrationsByDate[metric.date] ?? 0,
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
        impressions: impressionsByDate[date] ?? 0,
        followerDelta: 0,
        lineRegistrations: lineRegistrationsByDate[date] ?? 0,
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



    const competitorHighlights: DisplayHighlight[] = (
      insights.competitorHighlights.length ? insights.competitorHighlights : FALLBACK_HIGHLIGHTS
    ).map((item) => toDisplayHighlight(item));

    const trendingTopics = (
      insights.trendingTopics.length ? insights.trendingTopics : FALLBACK_TRENDING
    ).map((topic) => ({
      themeTag: topic.themeTag,
      avgFollowersDelta: topic.avgFollowersDelta,
      avgViews: topic.avgViews,
      sampleAccounts: topic.sampleAccounts ?? [],
    }));

    const templateSummaries =
      insights.templateSummaries && insights.templateSummaries.length
        ? insights.templateSummaries
        : FALLBACK_TEMPLATES;

    const templateOptions =
      insights.templateSummaries?.map((template) => ({
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
        { id: 'post' as ThreadsTabKey, label: '投稿' },
        { id: 'insights' as ThreadsTabKey, label: 'インサイト' },
        { id: 'competitor' as ThreadsTabKey, label: '競合インサイト' },
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
            stats={stats}
            noteText={noteText}
            planSummaries={planSummaries}
            templateOptions={templateOptions}
            recentLogs={dashboard.recentLogs as Array<Record<string, unknown>>}
            performanceSeries={trimmedPerformanceSeries}
            maxImpressions={maxImpressionsValue}
            maxFollowerDelta={maxFollowerDeltaValue}
          />
        ) : activeTab === 'insights' ? (
          <InsightsTab
            posts={insightsActivity.posts}
            dailyMetrics={insightsActivity.dailyMetrics}
            selectedRangeValue={rangeValueForUi}
            customStart={customStart}
            customEnd={customEnd}
            noteText={noteText}
            templateSummaries={templateSummaries}
          />
        ) : (
          <CompetitorTab highlights={competitorHighlights} trendingTopics={trendingTopics} />
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
