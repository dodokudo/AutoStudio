import { InsightsCard } from "./_components/insights-card";
import { CompetitorHighlights } from "./_components/competitor-highlight";
import { PostQueueContainer } from "./_components/post-queue-container";
import { getThreadsInsights } from "@/lib/threadsInsights";
import { listPlanSummaries, seedPlansIfNeeded } from "@/lib/bigqueryPlans";
import { getThreadsDashboard } from "@/lib/threadsDashboard";
import { TrendingTopics } from "./_components/trending-topics";
import { TemplateSummary } from "./_components/template-summary";
import { DashboardCards } from "./_components/dashboard-cards";
import { RegenerateButton } from "./_components/regenerate-button";

const PROJECT_ID = process.env.BQ_PROJECT_ID ?? "mark-454114";

export const dynamic = 'force-dynamic';

export default async function ThreadsHome() {
  try {
    console.log('[threads/page] Starting data fetch...');
    console.log('[threads/page] PROJECT_ID:', PROJECT_ID);

    console.log('[threads/page] Fetching insights...');
    const insights = await getThreadsInsights(PROJECT_ID);
    console.log('[threads/page] Insights fetched successfully');

    console.log('[threads/page] Seeding plans...');
    await seedPlansIfNeeded();
    console.log('[threads/page] Plans seeded successfully');

    console.log('[threads/page] Fetching plan summaries...');
    const planSummaries = await listPlanSummaries();
    console.log('[threads/page] Plan summaries fetched successfully');

    console.log('[threads/page] Fetching dashboard...');
    const dashboard = await getThreadsDashboard();
    console.log('[threads/page] Dashboard fetched successfully');

  const resolveDeltaTone = (value: number | undefined): 'up' | 'down' | 'neutral' | undefined => {
    if (value === undefined) return undefined;
    if (value === 0) return 'neutral';
    return value > 0 ? 'up' : 'down';
  };

  const stats = [
    {
      label: "平均フォロワー",
      value: insights.accountSummary.averageFollowers.toLocaleString(),
      delta:
        insights.accountSummary.followersChange === 0
          ? undefined
          : `${insights.accountSummary.followersChange > 0 ? '+' : ''}${insights.accountSummary.followersChange.toLocaleString()}`,
      deltaTone: resolveDeltaTone(insights.accountSummary.followersChange),
    },
    {
      label: "平均プロフ閲覧",
      value: insights.accountSummary.averageProfileViews.toLocaleString(),
      delta:
        insights.accountSummary.profileViewsChange === 0
          ? undefined
          : `${insights.accountSummary.profileViewsChange > 0 ? '+' : ''}${insights.accountSummary.profileViewsChange.toLocaleString()}`,
      deltaTone: resolveDeltaTone(insights.accountSummary.profileViewsChange),
    },
    {
      label: "最高閲覧投稿",
      value: insights.topSelfPosts[0]?.impressions
        ? insights.topSelfPosts[0].impressions.toLocaleString()
        : '—',
      delta: insights.topSelfPosts[0]?.postId
        ? `@${insights.topSelfPosts[0].postId}`
        : undefined,
    },
    {
      label: "トレンドテーマ",
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

  const highlights = insights.competitorHighlights.map((item) => ({
    accountName: item.accountName,
    username: item.username ?? undefined,
    impressions: item.impressions?.toLocaleString(),
    likes: item.likes?.toLocaleString(),
    summary: item.contentSnippet,
  }));

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-white">Threads 自動投稿管理</h1>
        <RegenerateButton />
      </div>
      <InsightsCard title="アカウント概況 (直近7日)" stats={stats} />
      <div className="space-y-10">
        <div className="grid gap-10 lg:grid-cols-[2fr,1.2fr]">
          <div className="space-y-10">
            <PostQueueContainer
              initialPlans={JSON.parse(JSON.stringify(planSummaries))}
              trendingThemes={insights.trendingTopics.map((topic) => topic.themeTag)}
              templateOptions={insights.templateSummaries?.map((template) => ({
                value: template.templateId,
                label: `${template.templateId} (v${template.version})`,
              })) || []}
            />
            <TrendingTopics
              items={insights.trendingTopics.map((topic) => ({
                themeTag: topic.themeTag,
                avgFollowersDelta: topic.avgFollowersDelta,
                avgViews: topic.avgViews,
                sampleAccounts: topic.sampleAccounts,
              }))}
            />
          </div>
          <CompetitorHighlights items={highlights} />
        </div>
        <TemplateSummary items={insights.templateSummaries} />
        <DashboardCards jobCounts={dashboard.jobCounts} recentLogs={dashboard.recentLogs} />
      </div>
    </div>
  );
  } catch (error) {
    console.error('[threads/page] Error occurred:', error);
    console.error('[threads/page] Error type:', typeof error);
    console.error('[threads/page] Error constructor:', error?.constructor?.name);
    if (error instanceof Error) {
      console.error('[threads/page] Error message:', error.message);
      console.error('[threads/page] Error stack:', error.stack);
    }
    return (
      <div className="space-y-10 p-8">
        <h1 className="text-xl font-semibold text-white">Threads 自動投稿管理</h1>
        <div className="rounded-md bg-red-50 p-4 border border-red-200">
          <h3 className="text-sm font-medium text-red-800">エラーが発生しました</h3>
          <div className="mt-2 text-sm text-red-700">
            <p>ページの読み込み中にエラーが発生しました。しばらく待ってから再度お試しください。</p>
            <details className="mt-2">
              <summary className="cursor-pointer">詳細情報</summary>
              <pre className="mt-2 text-xs overflow-auto">
                {error instanceof Error ? error.message : String(error)}
              </pre>
            </details>
          </div>
        </div>
      </div>
    );
  }
}
