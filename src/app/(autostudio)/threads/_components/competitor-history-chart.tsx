'use client';

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface CompetitorHistoryPoint {
  username: string;
  snapshotDate: string;
  collectedAt: string | null;
  followerCount: number | null;
  viewsCount: number | null;
  likesCount: number | null;
  repliesCount: number | null;
  repostsCount: number | null;
  quotesCount: number | null;
}
interface CompetitorHistoryChartProps {
  data: CompetitorHistoryPoint[];
}

const shortDateFormatter = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric',
  day: 'numeric',
  timeZone: 'Asia/Tokyo',
});

const longDateFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'Asia/Tokyo',
});

function metricTotal(point: CompetitorHistoryPoint): number | null {
  const values = [point.likesCount, point.repliesCount, point.repostsCount, point.quotesCount];
  return values.every((value) => value === null)
    ? null
    : values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function asLocalDate(date: string): Date {
  return new Date(`${date}T12:00:00+09:00`);
}

export function CompetitorHistoryChart({ data }: CompetitorHistoryChartProps) {
  const chartData = data.map((point) => ({
    ...point,
    label: shortDateFormatter.format(asLocalDate(point.snapshotDate)),
    engagementCount: metricTotal(point),
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-[var(--radius-sm)] bg-[color:var(--color-surface-muted)] px-4 text-center text-sm text-[color:var(--color-text-secondary)]">
        日次データはまだありません。次回の自動収集から履歴が増えていきます。
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(120, 131, 156, 0.24)" />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="activity"
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <YAxis
            yAxisId="followers"
            orientation="right"
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <Tooltip
            formatter={(value: number, name: string) => [value.toLocaleString('ja-JP'), name]}
            labelFormatter={(_label, payload) => {
              const snapshotDate = payload?.[0]?.payload?.snapshotDate as string | undefined;
              return snapshotDate ? longDateFormatter.format(asLocalDate(snapshotDate)) : '';
            }}
            contentStyle={{
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-primary)',
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            yAxisId="activity"
            type="monotone"
            dataKey="viewsCount"
            name="直近7日閲覧"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            connectNulls
          />
          <Line
            yAxisId="activity"
            type="monotone"
            dataKey="engagementCount"
            name="直近7日反応"
            stroke="#f59e0b"
            strokeWidth={2}
            connectNulls
          />
          <Line
            yAxisId="followers"
            type="monotone"
            dataKey="followerCount"
            name="フォロワー"
            stroke="#10b981"
            strokeWidth={2}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
