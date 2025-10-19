'use client';

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

import { InsightsCard } from './insights-card';
import { IndividualPostCard } from './individual-post-card';
import { RegenerateButton } from './regenerate-button';
import { PostQueueContainer } from './post-queue-container';
import { PostedContent } from './posted-content';
import type { ThreadPlanSummary } from '@/types/threadPlan';
import { Card } from '@/components/ui/card';

type TemplateOption = {
  value: string;
  label: string;
};

type PostTabProps = {
  stats: Array<{
    label: string;
    value: string;
    delta?: string;
    deltaTone?: 'up' | 'down' | 'neutral';
    deltaHighlight?: boolean;
  }>;
  noteText: string;
  planSummaries: ThreadPlanSummary[];
  templateOptions: TemplateOption[];
  recentLogs?: Array<Record<string, unknown>>;
  performanceSeries?: Array<{
    date: string;
    impressions: number;
    followerDelta: number;
  }>;
  maxImpressions?: number;
  maxFollowerDelta?: number;
};

export function PostTab({
  stats,
  noteText,
  planSummaries,
  templateOptions,
  recentLogs,
  performanceSeries,
  maxImpressions,
  maxFollowerDelta,
}: PostTabProps) {
  const numberFormatter = new Intl.NumberFormat('ja-JP');
  const dateFormatter = new Intl.DateTimeFormat('ja-JP', { month: '2-digit', day: '2-digit' });

  const chartData = (performanceSeries ?? []).map((item) => {
    let displayDate = item.date;
    const parsed = new Date(item.date);
    if (!Number.isNaN(parsed.getTime())) {
      displayDate = dateFormatter.format(parsed);
    }
    return {
      ...item,
      displayDate,
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
              日別のインプレッション（折れ線）とフォロワー増加数（棒グラフ）を直近30日で確認できます。
            </p>
          </div>
        </div>
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

      <IndividualPostCard />

      <Card>
        <header className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">今日の投稿案</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
              生成済みの投稿案を確認して編集・承認に進めます。
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RegenerateButton />
          </div>
        </header>
        <PostQueueContainer
          initialPlans={JSON.parse(JSON.stringify(planSummaries))}
          templateOptions={templateOptions}
          variant="embedded"
        />
      </Card>

      <PostedContent initialLogs={recentLogs} />
    </div>
  );
}
