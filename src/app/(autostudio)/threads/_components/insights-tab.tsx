'use client';

import { useMemo, useState } from 'react';
import type { DailyFollowerMetric, PostInsight } from '@/lib/threadsInsightsData';
import type { PromptTemplateSummary } from '@/types/prompt';
import { Card } from '@/components/ui/card';
import { AccountInsightsCard } from './account-insights-card';
import { TopContentCard } from './top-content-card';
import { TemplateSummary } from './template-summary';

interface RangePreset {
  value: string;
  days: number;
}

interface InsightsTabProps {
  posts: PostInsight[];
  dailyMetrics: DailyFollowerMetric[];
  rangePresets: RangePreset[];
  selectedRangeValue: string;
  customStart?: string;
  customEnd?: string;
  noteText: string;
  templateSummaries?: PromptTemplateSummary[];
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

type TopContentSort = 'postedAt' | 'views' | 'likes';

const DAY_MS = 24 * 60 * 60 * 1000;

export function InsightsTab({
  posts,
  dailyMetrics,
  rangePresets,
  selectedRangeValue,
  customStart,
  customEnd,
  noteText,
  templateSummaries,
}: InsightsTabProps) {
  const [topContentSort, setTopContentSort] = useState<TopContentSort>('views');

  const resolveRange = useMemo(() => {
    if (selectedRangeValue === 'custom' && customStart && customEnd) {
      const start = new Date(`${customStart}T00:00:00Z`);
      const end = new Date(`${customEnd}T23:59:59Z`);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        const orderedStart = start <= end ? start : end;
        const orderedEnd = start <= end ? end : start;
        return {
          start: orderedStart,
          end: orderedEnd,
        } as const;
      }
    }

    const preset = rangePresets.find((item) => item.value === selectedRangeValue) ?? rangePresets[0];
    const now = new Date();
    const start = new Date(now.getTime() - preset.days * DAY_MS);
    return {
      start,
      end: now,
    } as const;
  }, [selectedRangeValue, customStart, customEnd, rangePresets]);

  const currentRange = useMemo(() => {
    const { start, end } = resolveRange;
    const normalizedStart = new Date(start.getTime());
    const normalizedEnd = new Date(end.getTime());
    const duration = Math.max(normalizedEnd.getTime() - normalizedStart.getTime(), DAY_MS);
    const previousEnd = new Date(normalizedStart.getTime());
    const previousStart = new Date(previousEnd.getTime() - duration);

    return {
      start: normalizedStart,
      end: normalizedEnd,
      previousStart,
      previousEnd,
    } as const;
  }, [resolveRange]);

  const withinRange = (date: Date, start: Date, end: Date) =>
    date.getTime() >= start.getTime() && date.getTime() <= end.getTime();

  const filteredInsights = useMemo(() => {
    return posts.filter((post) => {
      const postedAt = new Date(post.postedAt);
      if (Number.isNaN(postedAt.getTime())) return false;
      return withinRange(postedAt, currentRange.start, currentRange.end);
    });
  }, [posts, currentRange]);

  const effectiveInsights = filteredInsights.length > 0 ? filteredInsights : posts;
  const isUsingFallbackRange = filteredInsights.length === 0 && posts.length > 0;

  const accountInsightsData = useMemo(() => {
    const inRange = (post: PostInsight, start: Date, end: Date) => {
      const postedAt = new Date(post.postedAt);
      if (Number.isNaN(postedAt.getTime())) return false;
      return withinRange(postedAt, start, end);
    };

    const currentPosts = posts.filter((post) => inRange(post, currentRange.start, currentRange.end));
    const previousPosts = posts.filter((post) => inRange(post, currentRange.previousStart, currentRange.previousEnd));

    const sumImpressions = (items: PostInsight[]) =>
      items.reduce((total, post) => total + (post.insights.impressions ?? 0), 0);
    const sumLikes = (items: PostInsight[]) =>
      items.reduce((total, post) => total + (post.insights.likes ?? 0), 0);
    const calcFollowerDelta = (series: DailyFollowerMetric[], start: Date, end: Date) => {
      const points = series.filter((point) => {
        const pointDate = new Date(`${point.date}T00:00:00Z`);
        return withinRange(pointDate, start, end);
      });
      if (!points.length) return 0;
      const followers = points.map((point) => point.followers);
      return Math.max(...followers) - Math.min(...followers);
    };

    const currentFollowers = calcFollowerDelta(dailyMetrics, currentRange.start, currentRange.end);
    const previousFollowers = calcFollowerDelta(dailyMetrics, currentRange.previousStart, currentRange.previousEnd);

    const currentLikes = sumLikes(currentPosts);
    const previousLikes = sumLikes(previousPosts);

    return {
      posts: currentPosts.length,
      views: sumImpressions(currentPosts),
      likes: currentLikes,
      newFollowers: currentFollowers,
      previousPosts: previousPosts.length,
      previousViews: sumImpressions(previousPosts),
      previousLikes,
      previousNewFollowers: previousFollowers,
    };
  }, [posts, dailyMetrics, currentRange]);

  const topContentData = useMemo(() => {
    const entries = effectiveInsights.map((post) => ({
      id: post.postedThreadId,
      content: post.mainText,
      views: post.insights.impressions ?? 0,
      likes: post.insights.likes ?? 0,
      replies: post.insights.replies ?? 0,
      postedAt: post.postedAt,
    }));

    entries.sort((a, b) => {
      switch (topContentSort) {
        case 'views':
          return (b.views ?? 0) - (a.views ?? 0);
        case 'likes':
          return (b.likes ?? 0) - (a.likes ?? 0);
        case 'postedAt':
        default:
          return new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime();
      }
    });

    return entries.slice(0, 30);
  }, [effectiveInsights, topContentSort]);

  return (
    <div className="section-stack">
      {posts.length === 0 ? (
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
      ) : null}

      {isUsingFallbackRange ? (
        <div className="rounded-[var(--radius-md)] border border-[#ffe0a3] bg-[#fff7e6] px-4 py-3 text-xs text-[#ad6800]">
          選択した期間内に投稿が見つからなかったため、最新の投稿実績で集計しています。
        </div>
      ) : null}

      <AccountInsightsCard data={accountInsightsData} note={noteText} />
      {templateSummaries && templateSummaries.length ? <TemplateSummary items={templateSummaries} /> : null}
      <TopContentCard posts={topContentData} sortOption={topContentSort} onSortChange={setTopContentSort} />
    </div>
  );
}
