'use client';

import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { LinkInsightItem } from '@/lib/links/types';
import type { LinkDailyClicks } from '@/lib/links/types';

interface LinkDailyChartProps {
  link: LinkInsightItem;
  startDate: string;
  endDate: string;
}

function formatDateShort(dateString: string): string {
  const date = new Date(dateString);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value ?? 0);
}

export function LinkDailyChart({ link, startDate, endDate }: LinkDailyChartProps) {
  const [dailyData, setDailyData] = useState<LinkDailyClicks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/links/${link.id}/daily?start=${startDate}&end=${endDate}`,
        );
        if (!res.ok) {
          throw new Error('Failed to fetch daily clicks');
        }
        const data = await res.json();
        setDailyData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading data');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [link.id, startDate, endDate]);

  const chartData =
    dailyData?.dailyClicks.map((d) => ({
      date: formatDateShort(d.date),
      clicks: d.clicks,
    })) ?? [];

  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[color:var(--color-text-primary)]">
          日別クリック推移: {link.managementName || link.shortCode}
        </h2>
        <span className="text-sm text-[color:var(--color-text-secondary)]">
          期間クリック: {formatNumber(link.periodClicks)}
        </span>
      </div>
      {loading ? (
        <div className="flex h-48 items-center justify-center text-sm text-[color:var(--color-text-secondary)]">
          読み込み中...
        </div>
      ) : error ? (
        <div className="flex h-48 items-center justify-center text-sm text-red-500">
          {error}
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex h-48 items-center justify-center text-sm text-[color:var(--color-text-secondary)]">
          データがありません
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '12px',
              }}
              labelStyle={{ fontWeight: 600 }}
            />
            <Bar dataKey="clicks" fill="#3b82f6" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
