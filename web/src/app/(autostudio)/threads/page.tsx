import { InsightsCard } from "./_components/insights-card";
import { CompetitorHighlights } from "./_components/competitor-highlight";
import { PostQueue } from "./_components/post-queue";
import { getThreadsInsights } from "@/lib/threadsInsights";
import { buildScheduleSlots } from "@/lib/promptBuilder";

const PROJECT_ID = process.env.BQ_PROJECT_ID ?? "mark-454114";

export default async function ThreadsHome() {
  const insights = await getThreadsInsights(PROJECT_ID);

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

  const schedule = buildScheduleSlots(insights.meta.targetPostCount);
  const queueItems = insights.topSelfPosts.slice(0, 5).map((post, index) => ({
    id: post.postId ?? `plan-${index + 1}`,
    scheduledTime: schedule[index] ?? '07:00',
    templateId: 'auto-generated',
    theme: insights.trendingTopics[index]?.themeTag ?? '未分類',
    status: (index === 0 ? 'draft' : index === 1 ? 'approved' : 'scheduled') as const,
    mainText: post.content?.slice(0, 280) ?? '',
    comments: [],
  }));

  return (
    <div className="space-y-10">
      <InsightsCard title="アカウント概況 (直近7日)" stats={stats} />
      <div className="grid gap-10 lg:grid-cols-[2fr,1.2fr]">
        <PostQueue items={queueItems} />
        <CompetitorHighlights items={highlights} />
      </div>
    </div>
  );
}
