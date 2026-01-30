'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

// ============================================================
// 型定義
// ============================================================

interface DailyData {
  date: string;
  revenue: number;
  lineRegistrations: number;
  frontendPurchases: number;
  backendPurchases: number;
}

interface DailyTrendChartProps {
  data: DailyData[];
}

type MetricType = 'line' | 'revenue' | 'purchases';

// ============================================================
// ユーティリティ
// ============================================================

const numberFormatter = new Intl.NumberFormat('ja-JP');

function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}

function formatCurrency(value: number): string {
  if (value >= 10000) {
    return `${formatNumber(value / 10000)}万`;
  }
  return `${formatNumber(value)}円`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

// ============================================================
// コンポーネント
// ============================================================

const METRIC_OPTIONS: { id: MetricType; label: string }[] = [
  { id: 'line', label: 'LINE登録' },
  { id: 'revenue', label: '売上' },
  { id: 'purchases', label: '購入数' },
];

export function DailyTrendChart({ data }: DailyTrendChartProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('line');

  // 今日までのデータのみフィルタ
  const today = new Date().toISOString().split('T')[0];
  const filteredData = data.filter((d) => d.date <= today);

  // チャートデータを整形
  const chartData = filteredData.map((d) => ({
    date: formatDate(d.date),
    fullDate: d.date,
    revenue: d.revenue,
    lineRegistrations: d.lineRegistrations,
    frontendPurchases: d.frontendPurchases,
    backendPurchases: d.backendPurchases,
  }));

  // 累積データを計算
  let cumulativeRevenue = 0;
  let cumulativeLine = 0;
  let cumulativeFrontend = 0;
  let cumulativeBackend = 0;

  const chartDataWithCumulative = chartData.map((d) => {
    cumulativeRevenue += d.revenue;
    cumulativeLine += d.lineRegistrations;
    cumulativeFrontend += d.frontendPurchases;
    cumulativeBackend += d.backendPurchases;
    return {
      ...d,
      cumulativeRevenue,
      cumulativeLine,
      cumulativeFrontend,
      cumulativeBackend,
    };
  });

  const renderChart = () => {
    switch (selectedMetric) {
      case 'line':
        return (
          <ComposedChart data={chartDataWithCumulative}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
              }}
              formatter={(value: number, name: string) => {
                if (name === '日別') return [`${formatNumber(value)}件`, name];
                return [`${formatNumber(value)}件`, name];
              }}
            />
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="lineRegistrations"
              name="日別"
              fill="var(--color-accent)"
              opacity={0.7}
              radius={[2, 2, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumulativeLine"
              name="累積"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        );

      case 'revenue':
        return (
          <ComposedChart data={chartDataWithCumulative}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
            />
            <YAxis
              yAxisId="left"
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
              tickFormatter={(v) => formatCurrency(v)}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
              tickFormatter={(v) => formatCurrency(v)}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
              }}
              formatter={(value: number, name: string) => [formatCurrency(value), name]}
            />
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="revenue"
              name="日別"
              fill="#10b981"
              opacity={0.7}
              radius={[2, 2, 0, 0]}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumulativeRevenue"
              name="累積"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        );

      case 'purchases':
        return (
          <ComposedChart data={chartDataWithCumulative}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--color-border)' }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
              }}
              formatter={(value: number, name: string) => [`${formatNumber(value)}件`, name]}
            />
            <Legend />
            <Bar
              dataKey="frontendPurchases"
              name="フロント"
              fill="#8b5cf6"
              opacity={0.7}
              radius={[2, 2, 0, 0]}
              stackId="purchases"
            />
            <Bar
              dataKey="backendPurchases"
              name="バックエンド"
              fill="#f59e0b"
              opacity={0.7}
              radius={[2, 2, 0, 0]}
              stackId="purchases"
            />
          </ComposedChart>
        );
    }
  };

  if (data.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          デイリー推移
        </h2>
        <p className="mt-4 text-center text-[color:var(--color-text-muted)]">
          データがありません
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          デイリー推移
        </h2>
        <div className="flex gap-1 rounded-lg border border-[color:var(--color-border)] p-1">
          {METRIC_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => setSelectedMetric(option.id)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                selectedMetric === option.id
                  ? 'bg-[color:var(--color-accent)] text-white'
                  : 'text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-surface-muted)]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
