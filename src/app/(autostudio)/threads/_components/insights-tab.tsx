'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PostInsight } from '@/lib/threadsInsightsData';
import { Card } from '@/components/ui/card';
import { InsightsCard } from './insights-card';
import { TopContentCard } from './top-content-card';
import { TimePerformanceCard } from './time-performance-card';
import { ThreadsFunnelComparison } from './threads-funnel-comparison';
import { PostAnalysisCard } from './post-analysis-card';
import { resolveDateRange, isUnifiedRangePreset, formatDateInput } from '@/lib/dateRangePresets';

interface InsightsTabProps {
  posts: PostInsight[];
  selectedRangeValue: string;
  customStart?: string;
  customEnd?: string;
  noteText: string;
  stats: Array<{
    label: string;
    value: string;
    delta?: string;
    deltaTone?: 'up' | 'down' | 'neutral';
    deltaHighlight?: boolean;
  }>;
  performanceSeries?: Array<{
    date: string;
    followers: number;
    impressions: number;
    followerDelta: number;
    linkClicks?: number;
    lineRegistrations?: number;
    postCount?: number;
  }>;
  maxImpressions?: number;
  maxFollowerDelta?: number;
}

type TopContentSort = 'postedAt' | 'views' | 'likes';

const DAY_MS = 24 * 60 * 60 * 1000;

export function InsightsTab({
  posts,
  selectedRangeValue,
  customStart,
  customEnd,
  noteText,
  stats,
  performanceSeries,
  maxImpressions,
  maxFollowerDelta,
}: InsightsTabProps) {
  const [topContentSort, setTopContentSort] = useState<TopContentSort>('views');
  const [showDailyTable, setShowDailyTable] = useState(true);
  const numberFormatter = new Intl.NumberFormat('ja-JP');
  const dateFormatter = new Intl.DateTimeFormat('ja-JP', { month: '2-digit', day: '2-digit' });
  const fullDateFormatter = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });

  const chartData = (performanceSeries ?? []).map((item) => {
    let displayDate = item.date;
    const parsed = new Date(item.date);
    if (!Number.isNaN(parsed.getTime())) {
      displayDate = dateFormatter.format(parsed);
    }
    return {
      ...item,
      displayDate,
      followers: item.followers ?? 0,
      linkClicks: item.linkClicks ?? 0,
    };
  });

  const hasChartData = chartData.length > 0;
  const impressionsAxisMax = (() => {
    if (typeof maxImpressions === 'number' && maxImpressions > 0) {
      return Math.ceil(maxImpressions * 1.1);
    }
    const localMax = chartData.reduce((max, item) => Math.max(max, item.impressions), 0);
    return localMax > 0 ? Math.ceil(localMax * 1.1) : 1;
  })();
  const followerAxisMax = (() => {
    if (typeof maxFollowerDelta === 'number' && maxFollowerDelta > 0) {
      return Math.ceil(maxFollowerDelta * 1.1);
    }
    const localMax = chartData.reduce((max, item) => Math.max(max, item.followerDelta), 0);
    return localMax > 0 ? Math.ceil(localMax * 1.1) : 1;
  })();

  const resolveRange = useMemo(() => {
    const presetValue = isUnifiedRangePreset(selectedRangeValue) ? selectedRangeValue : '7d';
    const { start, end } = resolveDateRange(presetValue, customStart, customEnd);
    return { start, end } as const;
  }, [selectedRangeValue, customStart, customEnd]);

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
      <InsightsCard
        title="アカウントの概要"
        stats={stats}
        note={noteText}
      />

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">インプレッション & フォロワー推移</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
              日別のインプレッション（折れ線）、フォロワー増加数とLINE登録数（棒グラフ）を直近30日で確認できます。
            </p>
          </div>
          <button
            onClick={() => setShowDailyTable(!showDailyTable)}
            className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-surface-muted)]"
          >
            {showDailyTable ? '表を閉じる' : '日別データを表示'}
          </button>
        </div>

        {/* 日別データ表 */}
        {showDailyTable && hasChartData && (
          <div className="mt-4 overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50">
                <tr className="border-b border-[color:var(--color-border)] text-left text-xs uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                  <th className="px-3 py-2">日付</th>
                  <th className="px-3 py-2 text-right">フォロワー数</th>
                  <th className="px-3 py-2 text-right">増加</th>
                  <th className="px-3 py-2 text-right">投稿</th>
                  <th className="px-3 py-2 text-right">インプ</th>
                  <th className="px-3 py-2 text-right">クリック</th>
                  <th className="px-3 py-2 text-right">LINE</th>
                  <th className="px-3 py-2 text-right">登録率</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-border)]">
                {[...chartData].reverse().map((item) => {
                  const parsed = new Date(item.date);
                  const displayFullDate = !Number.isNaN(parsed.getTime())
                    ? fullDateFormatter.format(parsed)
                    : item.date;
                  const linkClicks = item.linkClicks ?? 0;
                  const lineRegs = item.lineRegistrations ?? 0;
                  const registrationRate = linkClicks > 0 ? (lineRegs / linkClicks) * 100 : 0;
                  return (
                    <tr key={item.date} className="hover:bg-[color:var(--color-surface-muted)]">
                      <td className="px-3 py-2 font-medium text-[color:var(--color-text-primary)]">
                        {displayFullDate}
                      </td>
                      <td className="px-3 py-2 text-right text-[color:var(--color-text-primary)]">
                        {numberFormatter.format(item.followers ?? 0)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={item.followerDelta > 0 ? 'text-green-600' : 'text-[color:var(--color-text-secondary)]'}>
                          {item.followerDelta > 0 ? `+${numberFormatter.format(item.followerDelta)}` : '0'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-[color:var(--color-text-secondary)]">
                        {item.postCount ?? 0}
                      </td>
                      <td className="px-3 py-2 text-right text-[color:var(--color-text-primary)]">
                        {numberFormatter.format(item.impressions)}
                      </td>
                      <td className="px-3 py-2 text-right text-[color:var(--color-text-primary)]">
                        {numberFormatter.format(linkClicks)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className={lineRegs > 0 ? 'text-amber-600' : 'text-[color:var(--color-text-secondary)]'}>
                          {lineRegs > 0 ? `+${numberFormatter.format(lineRegs)}` : '0'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-[color:var(--color-text-secondary)]">
                        {linkClicks > 0 ? `${registrationRate.toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 h-72">
          {hasChartData ? (
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fontSize: 12, fill: '#475569' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#475569' }}
                  tickFormatter={(value) => numberFormatter.format(value as number)}
                  domain={[0, impressionsAxisMax]}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#475569' }}
                  tickFormatter={(value) => numberFormatter.format(value as number)}
                  domain={[0, followerAxisMax]}
                  allowDecimals={false}
                />
                <Tooltip
                  formatter={(value, name) => [
                    numberFormatter.format(value as number),
                    name,
                  ]}
                  labelFormatter={(_, payload) => {
                    const originalDate = payload?.[0]?.payload?.date;
                    const parsed = originalDate ? new Date(originalDate) : null;
                    return parsed && !Number.isNaN(parsed.getTime())
                      ? `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
                      : originalDate ?? '';
                  }}
                />
                <Bar
                  yAxisId="right"
                  dataKey="followerDelta"
                  name="フォロワー増加"
                  fill="var(--color-accent)"
                  opacity={0.6}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  yAxisId="right"
                  dataKey="lineRegistrations"
                  name="LINE登録数"
                  fill="#F59E0B"
                  opacity={0.7}
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="impressions"
                  name="インプレッション"
                  stroke="#6366f1"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)]">
              <p className="text-sm text-[color:var(--color-text-muted)]">表示できるデータがまだありません。</p>
            </div>
          )}
        </div>
      </Card>

      {isUsingFallbackRange ? (
        <div className="rounded-[var(--radius-md)] border border-[#ffe0a3] bg-[#fff7e6] px-4 py-3 text-xs text-[#ad6800]">
          選択した期間内に投稿が見つからなかったため、最新の投稿実績で集計しています。
        </div>
      ) : null}

      <ThreadsFunnelComparison
        currentStartDate={formatDateInput(currentRange.start)}
        currentEndDate={formatDateInput(currentRange.end)}
      />

      <PostAnalysisCard
        startDate={formatDateInput(currentRange.start)}
        endDate={formatDateInput(currentRange.end)}
      />

      <TimePerformanceCard
        posts={effectiveInsights.map((post) => ({
          postedAt: post.postedAt,
          impressions: post.insights.impressions ?? 0,
          likes: post.insights.likes ?? 0,
        }))}
      />

      <TopContentCard posts={topContentData} sortOption={topContentSort} onSortChange={setTopContentSort} />
    </div>
  );
}
