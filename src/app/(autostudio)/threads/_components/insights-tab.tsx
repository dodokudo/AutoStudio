'use client';

import { useMemo, useState } from 'react';
import type { PostInsight } from '@/lib/threadsInsightsData';
import type { ThreadInsights } from '@/lib/threadsApi';
import { AccountInsightsCard } from './account-insights-card';
import { TopContentCard } from './top-content-card';
import type { ThreadsInsightsData } from '@/lib/threadsInsights';

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
    summary: 'AIで月30時間削減。音声入力×自動化ワークフローの実例を解説。',
  },
  {
    postedAt: '2024-09-08 21:00',
    impressions: 8900,
    likes: 640,
    summary: 'Threads運用でまずやる3ステップ。23日でフォロワー+460を取った型。',
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
      <div className="space-y-6 rounded-2xl border border-slate-200 bg-white/60 p-8 shadow-sm dark:border-slate-700 dark:bg-white/5">
        <div className="text-sm text-slate-600 dark:text-slate-400">
          <p className="font-semibold text-slate-700 dark:text-slate-200">投稿実績を読み込めませんでした。</p>
          <p className="mt-2 leading-relaxed">
            BigQuery に投稿ログが未登録か、Threads API からの実績同期が未完了の可能性があります。投稿後に同期スクリプトを実行し、数分待ってから再読み込みしてください。
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-5 text-left text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-300">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">参考: 直近の好調パターン</p>
          <ul className="mt-3 space-y-3">
            {FALLBACK_INSIGHTS.map((item) => (
              <li key={item.postedAt} className="rounded-lg bg-slate-50/80 p-3 dark:bg-slate-800/60">
                <p className="text-xs text-slate-500 dark:text-slate-400">{item.postedAt}</p>
                <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">{item.summary}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  インプレッション {item.impressions.toLocaleString()} / いいね {item.likes.toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="section-stack">
      {isUsingFallbackRange ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          選択した期間内に投稿が見つからなかったため、最新の投稿実績で集計しています。
        </div>
      ) : null}

      <AccountInsightsCard data={accountInsightsData} onPeriodChange={setSelectedPeriod} />
      <TopContentCard posts={topContentData} />
    </div>
  );
}
