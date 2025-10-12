'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface YoutubeViewTrendPoint {
  date: string;
  views: number;
}

interface YoutubeViewTrendChartProps {
  data: YoutubeViewTrendPoint[];
}

const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric',
  day: 'numeric',
});

const tooltipFormatter = new Intl.DateTimeFormat('ja-JP', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function YoutubeViewTrendChart({ data }: YoutubeViewTrendChartProps) {
  const chartData = data.map((point) => ({
    ...point,
    label: dateFormatter.format(new Date(point.date)),
  }));

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 16, bottom: 0, left: -10 }}>
          <defs>
            <linearGradient id="youtubeViewsGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.4} />
              <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(120, 131, 156, 0.24)" />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={60}
          />
          <Tooltip
            formatter={(value: number) => value.toLocaleString()}
            labelFormatter={(_label, payload) => {
              const original = payload && payload[0]?.payload?.date;
              return original ? tooltipFormatter.format(new Date(original)) : '';
            }}
            contentStyle={{
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              backgroundColor: 'var(--color-surface)',
              color: 'var(--color-text-primary)',
            }}
          />
          <Area
            type="monotone"
            dataKey="views"
            stroke="var(--color-accent)"
            strokeWidth={2}
            fill="url(#youtubeViewsGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
