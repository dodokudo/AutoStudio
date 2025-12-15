'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Charge {
  id: string;
  charged_amount: number;
  charged_currency: string;
  status: string;
  created_on: string;
  metadata?: Record<string, string>;
}

interface SalesDashboardClientProps {
  initialData: {
    summary: {
      totalAmount: number;
      successfulCount: number;
      failedCount: number;
      pendingCount: number;
    };
    charges: Charge[];
    dateRange: {
      from: string;
      to: string;
    };
  };
}

export function SalesDashboardClient({ initialData }: SalesDashboardClientProps) {
  const { summary, charges, dateRange } = initialData;
  const numberFormatter = new Intl.NumberFormat('ja-JP');
  const dateFormatter = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const shortDateFormatter = new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
  });

  // 日別売上データを集計（期間内の全日付を含む）
  const dailySales = useMemo(() => {
    const dailyMap = new Map<string, { date: string; amount: number; count: number }>();

    // 期間内の全日付を初期化
    const startDate = new Date(dateRange.from);
    const endDate = new Date(dateRange.to);
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      dailyMap.set(dateStr, { date: dateStr, amount: 0, count: 0 });
    }

    // 売上データを集計
    for (const charge of charges) {
      if (charge.status !== 'successful') continue;

      const date = charge.created_on.split('T')[0];
      const existing = dailyMap.get(date);

      if (existing) {
        existing.amount += charge.charged_amount;
        existing.count += 1;
      }
    }

    return Array.from(dailyMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        ...item,
        displayDate: shortDateFormatter.format(new Date(item.date)),
      }));
  }, [charges, dateRange, shortDateFormatter]);

  // 累計売上を計算
  const cumulativeSales = useMemo(() => {
    let cumulative = 0;
    return dailySales.map((item) => {
      cumulative += item.amount;
      return {
        ...item,
        cumulative,
      };
    });
  }, [dailySales]);

  const successfulCharges = charges.filter((c) => c.status === 'successful');
  const recentCharges = [...successfulCharges]
    .sort((a, b) => new Date(b.created_on).getTime() - new Date(a.created_on).getTime())
    .slice(0, 20);

  // 平均単価を計算
  const averageAmount = summary.successfulCount > 0
    ? Math.round(summary.totalAmount / summary.successfulCount)
    : 0;

  return (
    <>
      {/* サマリーカード */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            売上合計
          </p>
          <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
            ¥{numberFormatter.format(summary.totalAmount)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            成功件数
          </p>
          <p className="mt-1 text-2xl font-bold text-green-600">
            {numberFormatter.format(summary.successfulCount)}件
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            平均単価
          </p>
          <p className="mt-1 text-2xl font-bold text-[color:var(--color-text-primary)]">
            ¥{numberFormatter.format(averageAmount)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-muted)]">
            失敗 / 処理中
          </p>
          <p className="mt-1 text-2xl font-bold">
            <span className="text-red-600">{summary.failedCount}</span>
            <span className="text-[color:var(--color-text-muted)]"> / </span>
            <span className="text-amber-600">{summary.pendingCount}</span>
          </p>
        </Card>
      </div>

      {/* 売上推移グラフ */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          売上推移
        </h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          日別売上（棒グラフ）と累計売上（折れ線）
        </p>
        <div className="mt-4 h-72">
          {cumulativeSales.length > 0 ? (
            <ResponsiveContainer>
              <ComposedChart data={cumulativeSales} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
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
                  tickFormatter={(value) => `¥${(value / 10000).toFixed(0)}万`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#475569' }}
                  tickFormatter={(value) => `¥${(value / 10000).toFixed(0)}万`}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    `¥${numberFormatter.format(value)}`,
                    name === 'amount' ? '日別売上' : '累計売上',
                  ]}
                  labelFormatter={(label) => label}
                />
                <Bar
                  yAxisId="left"
                  dataKey="amount"
                  name="日別売上"
                  fill="var(--color-accent)"
                  radius={[4, 4, 0, 0]}
                  opacity={0.8}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="cumulative"
                  name="累計売上"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)]">
              <p className="text-sm text-[color:var(--color-text-muted)]">
                選択した期間に売上データがありません
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* 日別売上テーブル */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          日別売上一覧
        </h2>
        <div className="mt-4 overflow-x-auto">
          {dailySales.filter((d) => d.count > 0).length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-xs uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                  <th className="px-3 py-2">日付</th>
                  <th className="px-3 py-2 text-right">売上</th>
                  <th className="px-3 py-2 text-right">件数</th>
                  <th className="px-3 py-2 text-right">平均</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-border)]">
                {[...dailySales].filter((d) => d.count > 0).reverse().map((day) => (
                  <tr key={day.date} className="hover:bg-[color:var(--color-surface-muted)]">
                    <td className="px-3 py-2 text-[color:var(--color-text-primary)]">
                      {day.date}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-[color:var(--color-text-primary)]">
                      ¥{numberFormatter.format(day.amount)}
                    </td>
                    <td className="px-3 py-2 text-right text-[color:var(--color-text-secondary)]">
                      {day.count}件
                    </td>
                    <td className="px-3 py-2 text-right text-[color:var(--color-text-secondary)]">
                      ¥{numberFormatter.format(Math.round(day.amount / day.count))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">
              売上データがありません
            </p>
          )}
        </div>
      </Card>

      {/* 取引一覧 */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          最近の取引
        </h2>
        <div className="mt-4 overflow-x-auto">
          {recentCharges.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-xs uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                  <th className="px-3 py-2">日時</th>
                  <th className="px-3 py-2 text-right">金額</th>
                  <th className="px-3 py-2">顧客名</th>
                  <th className="px-3 py-2">ステータス</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--color-border)]">
                {recentCharges.map((charge) => (
                  <tr key={charge.id} className="hover:bg-[color:var(--color-surface-muted)]">
                    <td className="px-3 py-2 text-[color:var(--color-text-primary)]">
                      {dateFormatter.format(new Date(charge.created_on))}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-[color:var(--color-text-primary)]">
                      ¥{numberFormatter.format(charge.charged_amount)}
                    </td>
                    <td className="px-3 py-2 text-[color:var(--color-text-secondary)]">
                      {charge.metadata?.['univapay-name'] ?? '-'}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={charge.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">
              取引データがありません
            </p>
          )}
        </div>
      </Card>
    </>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    successful: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    error: 'bg-red-100 text-red-800',
    pending: 'bg-amber-100 text-amber-800',
    awaiting: 'bg-amber-100 text-amber-800',
    authorized: 'bg-blue-100 text-blue-800',
    canceled: 'bg-gray-100 text-gray-800',
  };

  const labels: Record<string, string> = {
    successful: '成功',
    failed: '失敗',
    error: 'エラー',
    pending: '処理中',
    awaiting: '待機中',
    authorized: '認証済',
    canceled: 'キャンセル',
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-gray-100 text-gray-800'}`}
    >
      {labels[status] ?? status}
    </span>
  );
}
