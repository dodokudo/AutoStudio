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

interface LinkDetailPanelProps {
  link: LinkInsightItem;
  startDate: string;
  endDate: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  threads: 'Threads',
  instagram: 'Instagram',
  youtube: 'YouTube',
  ad: '広告',
  uncategorized: '未分類',
};

function formatCategory(category?: string | null): string {
  if (!category) return '未分類';
  const normalized = category.toLowerCase();
  return CATEGORY_LABELS[normalized] ?? category;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value ?? 0);
}

function formatDateShort(dateString: string): string {
  const date = new Date(dateString);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function LinkDetailPanel({ link, startDate, endDate }: LinkDetailPanelProps) {
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
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          {link.managementName || link.shortCode}
        </h3>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          {link.destinationUrl}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-[color:var(--color-border)] bg-gray-50 p-4">
          <p className="text-xs font-medium text-[color:var(--color-text-secondary)]">
            カテゴリ
          </p>
          <p className="mt-1 text-sm font-semibold text-[color:var(--color-text-primary)]">
            {formatCategory(link.category)}
          </p>
        </div>
        <div className="rounded-lg border border-[color:var(--color-border)] bg-gray-50 p-4">
          <p className="text-xs font-medium text-[color:var(--color-text-secondary)]">
            期間クリック数
          </p>
          <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
            {formatNumber(link.periodClicks)}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-[color:var(--color-border)] bg-white p-4">
        <h4 className="mb-4 text-sm font-semibold text-[color:var(--color-text-primary)]">
          日別クリック推移
        </h4>
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

      <div className="text-xs text-[color:var(--color-text-muted)]">
        累計クリック: {formatNumber(link.lifetimeClicks)}
        {link.lastClickedAt && (
          <span className="ml-4">
            最終クリック: {new Date(link.lastClickedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
          </span>
        )}
      </div>
    </div>
  );
}
