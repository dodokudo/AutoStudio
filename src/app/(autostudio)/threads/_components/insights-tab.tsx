'use client';

import { useMemo, useState } from 'react';
import type { PostInsight } from '@/lib/threadsInsightsData';
import type { ThreadInsights } from '@/lib/threadsApi';
import type { ThreadsInsightsData } from '@/lib/threadsInsights';
import { Card } from '@/components/ui/card';
import { AccountInsightsCard } from './account-insights-card';
import { TopContentCard } from './top-content-card';

interface InsightsTabProps {
  insights: PostInsight[];
  accountSummary: ThreadsInsightsData['accountSummary'];
}

const FALLBACK_INSIGHTS: Array<{
  postedAt: string;
  impressions: number;
  likes: number;
  summary: string;
}> = [
  {
    postedAt: '2024-09-10 07:15',
    impressions: 12400,
    likes: 980,
    summary: 'AIで月30時間削減。音声入力と自動化ワークフローで成果を最大化した事例。',
  },
  {
    postedAt: '2024-09-08 21:00',
    impressions: 8900,
    likes: 640,
    summary: 'Threads運用でフォロワーを伸ばした構成例。導入・本題・CTAの組み立てを解説。',
  },
];

export function InsightsTab({ insights, accountSummary }: InsightsTabProps) {
  const [selectedPeriod, setSelectedPeriod] = useState('7d');

  const filteredInsights = useMemo(() => {
    const now = new Date();
    const daysMap = { '3d': 3, '7d': 7, '30d': 30 } as const;
    const days = daysMap[selectedPeriod as keyof typeof daysMap] ?? 7;
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return insights.filter((post) => new Date(post.postedAt) >= cutoff);
  }, [insights, selectedPeriod]);

  const effectiveInsights = filteredInsights.length > 0 ? filteredInsights : insights;
  const isUsingFallbackRange = filteredInsights.length === 0 && insights.length > 0;

  const accountInsightsData = useMemo(() => {
    const current = effectiveInsights;

    const now = new Date();
    const daysMap = { '3d': 3, '7d': 7, '30d': 30 } as const;
    const days = daysMap[selectedPeriod as keyof typeof daysMap] ?? 7;
    const previousStart = new Date(now.getTime() - days * 2 * 24 * 60 * 60 * 1000);
    const previousEnd = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const previous = insights.filter((post) => {
      const postedAt = new Date(post.postedAt);
      return postedAt >= previousStart && postedAt < previousEnd;
    });

    const sum = (posts: PostInsight[], key: keyof ThreadInsights) =>
      posts.reduce((acc, post) => acc + (post.insights[key] ?? 0), 0);

    return {
      posts: current.length,
      views: sum(current, 'impressions'),
      replies: sum(current, 'replies'),
      interactions: sum(current, 'likes') + sum(current, 'replies'),
      newFollowers: accountSummary.followersChange ?? 0,
      previousPosts: previous.length,
      previousViews: sum(previous, 'impressions'),
      previousReplies: sum(previous, 'replies'),
      previousInteractions: sum(previous, 'likes') + sum(previous, 'replies'),
      previousNewFollowers: accountSummary.followersChange ?? 0,
    };
  }, [effectiveInsights, insights, selectedPeriod, accountSummary.followersChange]);

  const topContentData = useMemo(() => {
    return effectiveInsights
      .map((post) => ({
        id: post.postedThreadId,
        content: post.mainText,
        views: post.insights.impressions ?? 0,
        likes: post.insights.likes ?? 0,
        replies: post.insights.replies ?? 0,
        postedAt: post.postedAt,
      }))
      .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
      .slice(0, 5);
  }, [effectiveInsights]);

  if (insights.length === 0) {
    return (
      <Card>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">投稿実績を取得できませんでした</h2>
        <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
          BigQuery に投稿ログが未登録、もしくは Threads API の同期が未完了の可能性があります。投稿後に同期処理を実行し、数分待ってから再読み込みしてください。
        </p>
        <div className="mt-5 rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4 text-sm text-[color:var(--color-text-secondary)]">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-text-muted)]">参考</p>
          <ul className="mt-3 space-y-2">
            {FALLBACK_INSIGHTS.map((item) => (
              <li key={item.postedAt} className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2 text-xs">
                <p className="text-[color:var(--color-text-muted)]">{item.postedAt}</p>
                <p className="mt-1 text-sm font-medium text-[color:var(--color-text-primary)]">{item.summary}</p>
                <p className="mt-1 text-[color:var(--color-text-muted)]">
                  インプレッション {item.impressions.toLocaleString()} / いいね {item.likes.toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </Card>
    );
  }

  return (
    <div className="section-stack">
      {isUsingFallbackRange ? (
        <div className="rounded-[var(--radius-md)] border border-[#ffe0a3] bg-[#fff7e6] px-4 py-3 text-xs text-[#ad6800]">
          選択した期間内に投稿が見つからなかったため、最新の投稿実績で集計しています。
        </div>
      ) : null}

      <AccountInsightsCard data={accountInsightsData} onPeriodChange={setSelectedPeriod} />
      <TopContentCard posts={topContentData} />
    </div>
  );
}
