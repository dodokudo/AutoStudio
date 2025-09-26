import { InsightsCard } from "./_components/insights-card";
import { CompetitorHighlights } from "./_components/competitor-highlight";
import { PostQueueContainer } from "./_components/post-queue-container";
import { getThreadsInsights } from "@/lib/threadsInsights";
import { listPlanSummaries, seedPlansIfNeeded } from "@/lib/bigqueryPlans";
import { getThreadsDashboard } from "@/lib/threadsDashboard";
import { resolveProjectId } from "@/lib/bigquery";
import { TemplateSummary } from "./_components/template-summary";
import { DashboardCards } from "./_components/dashboard-cards";
import { RegenerateButton } from "./_components/regenerate-button";
import { InsightsRangeSelector } from "./_components/insights-range-selector";
import type { PromptCompetitorHighlight, PromptTemplateSummary } from "@/types/prompt";

const PROJECT_ID = resolveProjectId();

export const dynamic = 'force-dynamic';

type QueueMetrics = {
  draft: number;
  approved: number;
  scheduled: number;
  rejected: number;
};

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

export default async function ThreadsHome() {
  try {
    const [insights, planSummaries, dashboard] = await Promise.all([
      getThreadsInsights(PROJECT_ID),
      (async () => {
        await seedPlansIfNeeded();
        return listPlanSummaries();
      })(),
      getThreadsDashboard(),
    ]);

    const resolveDeltaTone = (value: number | undefined): 'up' | 'down' | 'neutral' | undefined => {
      if (value === undefined) return undefined;
      if (value === 0) return 'neutral';
      return value > 0 ? 'up' : 'down';
    };

    const stats = [
      {
        label: '平均フォロワー',
        value: insights.accountSummary.averageFollowers.toLocaleString(),
        delta:
          insights.accountSummary.followersChange === 0
            ? undefined
            : `${insights.accountSummary.followersChange > 0 ? '+' : ''}${insights.accountSummary.followersChange.toLocaleString()}`,
        deltaTone: resolveDeltaTone(insights.accountSummary.followersChange),
      },
      {
        label: '平均プロフ閲覧',
        value: insights.accountSummary.averageProfileViews.toLocaleString(),
        delta:
          insights.accountSummary.profileViewsChange === 0
            ? undefined
            : `${insights.accountSummary.profileViewsChange > 0 ? '+' : ''}${insights.accountSummary.profileViewsChange.toLocaleString()}`,
        deltaTone: resolveDeltaTone(insights.accountSummary.profileViewsChange),
      },
      {
        label: '最高閲覧投稿',
        value: insights.topSelfPosts[0]?.impressions
          ? insights.topSelfPosts[0].impressions.toLocaleString()
          : '—',
        delta: insights.topSelfPosts[0]?.postId ? `@${insights.topSelfPosts[0].postId}` : undefined,
      },
      {
        label: 'トレンドテーマ',
        value: insights.trendingTopics[0]?.themeTag ?? '確認中',
        delta: insights.trendingTopics[0]
          ? `Avg Δフォロワー ${Math.round(insights.trendingTopics[0].avgFollowersDelta)}`
          : undefined,
        deltaTone: resolveDeltaTone(
          insights.trendingTopics[0]
            ? Math.round(insights.trendingTopics[0].avgFollowersDelta)
            : undefined,
        ),
      },
    ];

    const queueMetrics = planSummaries.reduce<QueueMetrics>(
      (acc, plan) => {
        if (plan.status in acc) {
          acc[plan.status as keyof QueueMetrics] += 1;
        }
        return acc;
      },
      { draft: 0, approved: 0, scheduled: 0, rejected: 0 },
    );

    const heroStats = [
      {
        label: '承認待ち',
        value: queueMetrics.draft,
        caption: 'レビューが必要な投稿',
        tone: 'text-amber-600 bg-amber-100/60',
      },
      {
        label: '本日予約',
        value: queueMetrics.scheduled,
        caption: 'Threads API による予約',
        tone: 'text-sky-600 bg-sky-100/60',
      },
      {
        label: '今日完了',
        value: dashboard.jobCounts.succeededToday,
        caption: '投稿成功数 (本日)',
        tone: 'text-emerald-600 bg-emerald-100/60',
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

    return (
      <div className="section-stack">
        <section className="relative overflow-hidden rounded-[36px] border border-white/60 bg-white/90 px-8 py-10 shadow-[0_30px_70px_rgba(125,145,211,0.25)] dark:bg-white/10">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-10 top-[-50px] h-48 w-48 rounded-full bg-gradient-to-br from-indigo-400/50 via-purple-300/40 to-white/0 blur-3xl" />
            <div className="absolute right-[-40px] top-10 h-40 w-40 rounded-full bg-gradient-to-br from-emerald-300/40 via-sky-200/30 to-white/0 blur-3xl" />
          </div>
          <div className="relative flex flex-col gap-8 lg:flex-row lg:items-center">
            <div className="flex-1 space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-indigo-100/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-indigo-500">
                Threads automation
              </span>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                Threads 自動投稿管理
              </h1>
              <p className="max-w-xl text-sm leading-relaxed text-slate-500 dark:text-slate-300">
                毎朝の生成から承認、投稿ログまでを 1 つの画面に集約。チームの判断を高速化し、Threads 運用をスケーラブルに進めましょう。
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <RegenerateButton />
                <Link href="/threads/spec" className="button-secondary">
                  仕様書を確認
                </Link>
              </div>
            </div>
            <div className="grid w-full gap-4 sm:grid-cols-3 lg:w-auto">
              {heroStats.map((stat) => (
                <div key={stat.label} className="rounded-3xl bg-white/85 p-4 text-center shadow-[0_18px_38px_rgba(110,132,206,0.18)] dark:bg-white/10">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                    {stat.value.toLocaleString()}
                  </p>
                  <p className={`mt-2 rounded-full px-2.5 py-1 text-[11px] font-medium ${stat.tone}`}>
                    {stat.caption}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <InsightsCard title="アカウント概況 (直近7日)" stats={stats} />

        <div className="grid gap-10 lg:grid-cols-[1.85fr,1fr]">
          <div className="section-stack">
            <PostQueueContainer
              initialPlans={JSON.parse(JSON.stringify(planSummaries))}
              templateOptions={
                insights.templateSummaries?.map((template) => ({
                  value: template.templateId,
                  label: `${template.templateId} (v${template.version})`,
                })) || []
              }
            />
            <TrendingTopics items={trendingTopics} />
          </div>
          <CompetitorHighlights items={competitorHighlights} />
        </div>

        <TemplateSummary items={templateSummaries} />
        <DashboardCards jobCounts={dashboard.jobCounts} recentLogs={dashboard.recentLogs} />
        <div className="sticky bottom-10 mt-6 flex justify-end">
          <button type="button" className="button-primary pointer-events-auto gap-3">
            今日の投稿を確定
            <span className="rounded-full bg-white/25 px-2 py-0.5 text-[11px]">承認待ち {queueMetrics.draft}</span>
          </button>
        </div>
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
