import { getThreadsInsights, type ThreadsInsightsOptions } from "@/lib/threadsInsights";
import { listPlanSummaries, seedPlansIfNeeded } from "@/lib/bigqueryPlans";
import { getThreadsDashboard } from "@/lib/threadsDashboard";
import { getThreadsInsightsData } from "@/lib/threadsInsightsData";
import { resolveProjectId } from "@/lib/bigquery";
import { PostTab } from "./_components/post-tab";
import { InsightsTab } from "./_components/insights-tab";
import { CompetitorTab } from "./_components/competitor-tab";
import { countLineSourceRegistrations } from "@/lib/lstep/dashboard";
import { getThreadsLinkClicksByRange } from "@/lib/links/analytics";
import type { PromptCompetitorHighlight, PromptTemplateSummary, PromptTrendingTopic } from "@/types/prompt";

const PROJECT_ID = resolveProjectId();

const INSIGHTS_RANGE_OPTIONS = [
  { label: "3日間", value: "3d", days: 3 },
  { label: "7日間", value: "7d", days: 7 },
  { label: "30日間", value: "30d", days: 30 },
] as const;
const RANGE_SELECT_OPTIONS = [
  { label: "3日間", value: "3d" },
  { label: "7日間", value: "7d" },
  { label: "30日間", value: "30d" },
  { label: "カスタム", value: "custom" },
];

export const dynamic = 'force-dynamic';

const DAY_MS = 24 * 60 * 60 * 1000;

const formatDateKey = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
  const isValidDateString = (value: string | undefined): value is string =>
    !!value && /^\d{4}-\d{2}-\d{2}$/.test(value);

  const defaultRange = INSIGHTS_RANGE_OPTIONS[1];
  const selectedPreset = INSIGHTS_RANGE_OPTIONS.find((option) => option.value === rangeParam) ?? defaultRange;
  let selectedRangeValue: string = selectedPreset.value;
  let noteText = `レポート期間: ${selectedPreset.label}`;
  let customStart: string | undefined = isValidDateString(startParam) ? startParam : undefined;
  let customEnd: string | undefined = isValidDateString(endParam) ? endParam : undefined;

  let insightsOptions: ThreadsInsightsOptions = { rangeDays: selectedPreset.days };

  if (rangeParam === "custom" && customStart && customEnd) {
    const parsedStart = new Date(`${customStart}T00:00:00Z`);
    const parsedEnd = new Date(`${customEnd}T00:00:00Z`);
    if (!Number.isNaN(parsedStart.getTime()) && !Number.isNaN(parsedEnd.getTime())) {
      let normalizedStart = parsedStart;
      let normalizedEnd = parsedEnd;
      if (parsedStart > parsedEnd) {
        normalizedStart = parsedEnd;
        normalizedEnd = parsedStart;
      }
      customStart = normalizedStart.toISOString().slice(0, 10);
      customEnd = normalizedEnd.toISOString().slice(0, 10);
      insightsOptions = { startDate: customStart, endDate: customEnd };
      selectedRangeValue = "custom";
      noteText = `レポート期間: ${customStart} 〜 ${customEnd}`;
    }
  }

  const selectedRangeWindow = (() => {
    if (selectedRangeValue === 'custom' && customStart && customEnd) {
      const startDate = new Date(`${customStart}T00:00:00Z`);
      const endDate = new Date(`${customEnd}T23:59:59Z`);
      if (!Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())) {
        const start = startDate <= endDate ? startDate : endDate;
        const end = startDate <= endDate ? endDate : startDate;
        return { start, end } as const;
      }
    }

    const days = selectedPreset.days;
    const now = new Date();
    const start = new Date(now.getTime() - days * DAY_MS);
    return { start, end: now } as const;
  })();

  const tabParamRaw = typeof resolvedSearchParams?.tab === "string" ? resolvedSearchParams.tab : undefined;
  const normalizedTabParam = tabParamRaw === 'overview' ? 'post' : tabParamRaw;
  const allowedTabs: ThreadsTabKey[] = ['post', 'insights', 'competitor'];
  const activeTab: ThreadsTabKey = allowedTabs.find((tab) => tab === normalizedTabParam) ?? 'post';

  try {
    const { start: rangeStartDate, end: rangeEndDate } = selectedRangeWindow;

    const durationMs = Math.max(rangeEndDate.getTime() - rangeStartDate.getTime(), DAY_MS);
    const previousRangeEnd = new Date(rangeStartDate.getTime() - 1);
    const previousRangeStart = new Date(previousRangeEnd.getTime() - durationMs);

    const [insights, planSummaries, dashboard, insightsActivity, currentClicks, previousClicks] = await Promise.all([
      getThreadsInsights(PROJECT_ID, insightsOptions),
      (async () => {
        await seedPlansIfNeeded();
        return listPlanSummaries();
      })(),
      getThreadsDashboard(),
      getThreadsInsightsData(),
      getThreadsLinkClicksByRange(rangeStartDate, rangeEndDate),
      getThreadsLinkClicksByRange(previousRangeStart, previousRangeEnd),
    ]);

    let lineRegistrationCount: number | null = null;
    let profileViewsForRange: number | null = null;
    let previousProfileViews: number | null = null;
    let linkClicksForRange: number | null = null;
    let previousLinkClicks: number | null = null;
    let postsCountForRange: number = insights.postCount;
    let previousPostsCount: number | null = null;

    if (selectedRangeWindow) {
      const rangeStartKey = formatDateKey(rangeStartDate);
      const rangeEndKey = formatDateKey(rangeEndDate);

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

      linkClicksForRange = currentClicks.reduce((sum, item) => sum + item.clicks, 0);
      previousLinkClicks = previousClicks.reduce((sum, item) => sum + item.clicks, 0);

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

    const totalLinkClicks =
      typeof linkClicksForRange === 'number'
        ? linkClicksForRange
        : currentClicks.reduce((sum, item) => sum + item.clicks, 0);

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

    const lineRegistrationsNumeric =
      typeof lineRegistrationCount === 'number' && Number.isFinite(lineRegistrationCount)
        ? lineRegistrationCount
        : null;

    const linkClicksDeltaValue =
      previousLinkClicks !== null ? totalLinkClicks - previousLinkClicks : null;

    const postsDeltaValue =
      previousPostsCount !== null ? postsCountForRange - previousPostsCount : null;

    const linkClickConversionRate = safeDivide(totalLinkClicks, profileViewsNumeric);
    const lineRegistrationConversionRate = safeDivide(lineRegistrationsNumeric, totalLinkClicks);

    const rangeDurationDays = selectedRangeWindow
      ? Math.max(1, Math.round((selectedRangeWindow.end.getTime() - selectedRangeWindow.start.getTime()) / DAY_MS) + 1)
      : selectedPreset.days;

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
          insights.accountSummary.followersChange === 0
            ? undefined
            : `${insights.accountSummary.followersChange > 0 ? '+' : ''}${formatNumber(
                insights.accountSummary.followersChange,
              )}`,
        deltaTone: resolveDeltaTone(insights.accountSummary.followersChange),
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

    return (
      <div className="section-stack">

        {/* Tab Navigation */}
        <div className="flex border-b border-[color:var(--color-border)] overflow-x-auto scrollbar-hide">
          <a
            href={`?${new URLSearchParams({
              ...(rangeParam && { range: rangeParam }),
              ...(customStart && { start: customStart }),
              ...(customEnd && { end: customEnd }),
              tab: 'post',
            }).toString()}`}
            className={`px-4 md:px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'post'
                ? 'border-b-2 border-[color:var(--color-accent)] text-[color:var(--color-accent)]'
                : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
            }`}
          >
            投稿
          </a>
          <a
            href={`?${new URLSearchParams({
              ...(rangeParam && { range: rangeParam }),
              ...(customStart && { start: customStart }),
              ...(customEnd && { end: customEnd }),
              tab: 'insights',
            }).toString()}`}
            className={`px-4 md:px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'insights'
                ? 'border-b-2 border-[color:var(--color-accent)] text-[color:var(--color-accent)]'
                : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
            }`}
          >
            インサイト
          </a>
          <a
            href={`?${new URLSearchParams({
              ...(rangeParam && { range: rangeParam }),
              ...(customStart && { start: customStart }),
              ...(customEnd && { end: customEnd }),
              tab: 'competitor',
            }).toString()}`}
            className={`px-4 md:px-6 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'competitor'
                ? 'border-b-2 border-[color:var(--color-accent)] text-[color:var(--color-accent)]'
                : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
            }`}
          >
            競合インサイト
          </a>
        </div>

        {/* Tab Content */}
        {activeTab === 'post' ? (
          <PostTab
            stats={stats}
            noteText={noteText}
            rangeSelectorOptions={rangeSelectorOptions}
            selectedRangeValue={selectedRangeValue}
            customStart={customStart}
            customEnd={customEnd}
            planSummaries={planSummaries}
            templateOptions={templateOptions}
            recentLogs={dashboard.recentLogs as Array<Record<string, unknown>>}
          />
        ) : activeTab === 'insights' ? (
          <InsightsTab
            posts={insightsActivity.posts}
            dailyMetrics={insightsActivity.dailyMetrics}
            rangeSelectorOptions={rangeSelectorOptions}
            rangePresets={INSIGHTS_RANGE_OPTIONS.map(({ value, days }) => ({ value, days }))}
            selectedRangeValue={selectedRangeValue}
            customStart={customStart}
            customEnd={customEnd}
            noteText={noteText}
            templateSummaries={templateSummaries}
          />
        ) : (
          <CompetitorTab highlights={competitorHighlights} trendingTopics={trendingTopics} />
        )}
      </div>
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
