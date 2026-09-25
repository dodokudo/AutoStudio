'use client';

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface CompetitorDailyPoint {
  username: string;
  /** Post day in JST (YYYY-MM-DD). The snapshot that produced it was taken the next morning. */
  postDate: string;
  estimatedViews: number | null;
  followerDelta: number | null;
  postCount: number;
  /** True while the estimate still depends on the seeded first week. */
  seeded: boolean;
  /** Raw change of the seven-day total. Negative means a large post aged out of the window. */
  deltaFromPrevious: number | null;
  /** Sum of the latest public view counts of the posts published that day. Null until collected. */
  actualViews: number | null;
}

interface CompetitorDailyChartProps {
  data: CompetitorDailyPoint[];
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
  weekday: 'short',
  timeZone: 'Asia/Tokyo',
});

function asLocalDate(date: string): Date {
  return new Date(`${date}T12:00:00+09:00`);
}

export function CompetitorDailyChart({ data }: CompetitorDailyChartProps) {
  const chartData = data.map((point) => ({
    ...point,
    label: shortDateFormatter.format(asLocalDate(point.postDate)),
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-[var(--radius-sm)] bg-[color:var(--color-surface-muted)] px-4 text-center text-sm text-[color:var(--color-text-secondary)]">
        日別データはまだありません。2回目の自動収集から表示されます。
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(120, 131, 156, 0.24)" />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="views"
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={64}
          />
          <YAxis
            yAxisId="small"
            orientation="right"
            tick={{ fill: 'var(--color-text-secondary)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            formatter={(value: number, name: string) => [value.toLocaleString('ja-JP'), name]}
            labelFormatter={(_label, payload) => {
              const postDate = payload?.[0]?.payload?.postDate as string | undefined;
              const seeded = payload?.[0]?.payload?.seeded as boolean | undefined;
              if (!postDate) return '';
              return `${longDateFormatter.format(asLocalDate(postDate))}の投稿${seeded ? '（推定は粗い期間）' : ''}`;
            }}
            contentStyle={{
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-primary)',
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            yAxisId="small"
            dataKey="postCount"
            name="投稿数"
            fill="rgba(120, 131, 156, 0.28)"
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
          <Line
            yAxisId="views"
            type="monotone"
            dataKey="actualViews"
            name="閲覧数（その日の投稿の実数）"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            connectNulls
          />
          <Line
            yAxisId="views"
            type="monotone"
            dataKey="estimatedViews"
            name="推定閲覧数（7日合計の差分）"
            stroke="rgba(120, 131, 156, 0.7)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
