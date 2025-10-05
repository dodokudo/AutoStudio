'use client';

import { useState, useMemo } from 'react';
import type { DailyRegistration } from '@/lib/lstep/analytics';

interface DailyRegistrationsTableProps {
  data: DailyRegistration[];
}

type DateRangeFilter = '7days' | '30days' | '90days' | 'all';

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value);
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

export function DailyRegistrationsTable({ data }: DailyRegistrationsTableProps) {
  const [dateRange, setDateRange] = useState<DateRangeFilter>('30days');

  const filteredData = useMemo(() => {
    if (dateRange === 'all') {
      return data;
    }

    const days = dateRange === '7days' ? 7 : dateRange === '30days' ? 30 : 90;
    return data.slice(0, days);
  }, [data, dateRange]);

  return (
    <div>
      {/* フィルター */}
      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm text-[color:var(--color-text-secondary)] font-medium">表示期間:</span>
        <div className="flex gap-2">
          <button
            onClick={() => setDateRange('7days')}
            className={`px-3 py-1.5 text-sm rounded-[var(--radius-sm)] transition-colors ${
              dateRange === '7days'
                ? 'bg-[color:var(--color-accent)] text-white font-medium'
                : 'bg-[color:var(--color-surface)] border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-surface-muted)]'
            }`}
          >
            過去7日
          </button>
          <button
            onClick={() => setDateRange('30days')}
            className={`px-3 py-1.5 text-sm rounded-[var(--radius-sm)] transition-colors ${
              dateRange === '30days'
                ? 'bg-[color:var(--color-accent)] text-white font-medium'
                : 'bg-[color:var(--color-surface)] border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-surface-muted)]'
            }`}
          >
            過去30日
          </button>
          <button
            onClick={() => setDateRange('90days')}
            className={`px-3 py-1.5 text-sm rounded-[var(--radius-sm)] transition-colors ${
              dateRange === '90days'
                ? 'bg-[color:var(--color-accent)] text-white font-medium'
                : 'bg-[color:var(--color-surface)] border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-surface-muted)]'
            }`}
          >
            過去90日
          </button>
          <button
            onClick={() => setDateRange('all')}
            className={`px-3 py-1.5 text-sm rounded-[var(--radius-sm)] transition-colors ${
              dateRange === 'all'
                ? 'bg-[color:var(--color-accent)] text-white font-medium'
                : 'bg-[color:var(--color-surface)] border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-surface-muted)]'
            }`}
          >
            全期間
          </button>
        </div>
      </div>

      {/* テーブル */}
      <div className="overflow-x-auto border border-[color:var(--color-border)] rounded-[var(--radius-md)]">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-[color:var(--color-surface-muted)]">
            <tr>
              <th className="px-4 py-3 text-left font-semibold text-[color:var(--color-text-secondary)] border-b border-[color:var(--color-border)]">
                日付
              </th>
              <th className="px-4 py-3 text-right font-semibold text-[color:var(--color-text-secondary)] border-b border-[color:var(--color-border)]">
                登録数
              </th>
              <th className="px-4 py-3 text-right font-semibold text-[color:var(--color-text-secondary)] border-b border-[color:var(--color-border)]">
                アンケート回答数
              </th>
              <th className="px-4 py-3 text-right font-semibold text-[color:var(--color-text-secondary)] border-b border-[color:var(--color-border)]">
                回答率
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length > 0 ? (
              filteredData.map((row) => (
                <tr key={row.date} className="hover:bg-[color:var(--color-surface-muted)]">
                  <td className="px-4 py-3 text-[color:var(--color-text-primary)] border-b border-[color:var(--color-border)] last:border-b-0">
                    {formatDateLabel(row.date)}
                  </td>
                  <td className="px-4 py-3 text-right text-[color:var(--color-text-primary)] border-b border-[color:var(--color-border)] last:border-b-0">
                    {formatNumber(row.registrations)}
                  </td>
                  <td className="px-4 py-3 text-right text-[color:var(--color-text-primary)] border-b border-[color:var(--color-border)] last:border-b-0">
                    {formatNumber(row.surveyCompleted)}
                  </td>
                  <td className="px-4 py-3 text-right border-b border-[color:var(--color-border)] last:border-b-0">
                    <span
                      className={
                        row.completionRate >= 70
                          ? 'text-[color:var(--color-success)] font-semibold'
                          : row.completionRate >= 50
                            ? 'text-[color:var(--color-warning)] font-semibold'
                            : 'text-[color:var(--color-text-secondary)]'
                      }
                    >
                      {formatPercent(row.completionRate)}
                    </span>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[color:var(--color-text-muted)]">
                  データがありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
