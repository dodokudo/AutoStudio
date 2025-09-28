'use client';

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import type { FollowerPoint } from '@/lib/instagram/dashboard';

interface FollowerChartProps {
  data: FollowerPoint[];
}

export function FollowerChart({ data }: FollowerChartProps) {
  // データを日付順にソート
  const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // チャート用データ形式に変換
  const chartData = sortedData.map((point) => ({
    date: new Date(point.date).toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric'
    }),
    フォロワー: point.followers,
    リーチ: point.reach,
    エンゲージメント: point.engagement
  }));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{
            top: 20,
            right: 30,
            bottom: 20,
            left: 20,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
          <XAxis
            dataKey="date"
            stroke="#9CA3AF"
            fontSize={12}
          />
          <YAxis
            yAxisId="left"
            stroke="#9CA3AF"
            fontSize={12}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#9CA3AF"
            fontSize={12}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              color: '#F9FAFB'
            }}
            formatter={(value: number, name: string) => [
              value.toLocaleString(),
              name
            ]}
          />
          <Legend />

          {/* フォロワー数を線グラフで表示 */}
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="フォロワー"
            stroke="#3B82F6"
            strokeWidth={3}
            dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2 }}
          />

          {/* リーチとエンゲージメントを棒グラフで表示 */}
          <Bar
            yAxisId="right"
            dataKey="リーチ"
            fill="#10B981"
            opacity={0.6}
            barSize={20}
          />
          <Bar
            yAxisId="right"
            dataKey="エンゲージメント"
            fill="#8B5CF6"
            opacity={0.6}
            barSize={20}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}