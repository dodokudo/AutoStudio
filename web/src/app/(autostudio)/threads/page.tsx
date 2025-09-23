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

export default async function ThreadsHome() {
  const insights = await getThreadsInsights(PROJECT_ID);
  await seedPlansIfNeeded();
  const planSummaries = await listPlanSummaries();
  const dashboard = await getThreadsDashboard();

  const resolveDeltaTone = (value: number | undefined) => {
    if (value === undefined || value === 0) return undefined;
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
}
