'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import type { KpiTarget } from '@/lib/home/kpi-types';

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

interface DailyDetailsTableProps {
  data: DailyData[];
  kpiTarget: KpiTarget;
}

// ============================================================
// ユーティリティ
// ============================================================

const numberFormatter = new Intl.NumberFormat('ja-JP');

function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}

function formatCurrency(value: number): string {
  if (value >= 10000) {
    return `${formatNumber(value / 10000)}万円`;
  }
  return `${formatNumber(value)}円`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const dayOfWeek = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
  return `${date.getMonth() + 1}/${date.getDate()}(${dayOfWeek})`;
}

function isWeekend(dateStr: string): boolean {
  const date = new Date(dateStr);
  const day = date.getDay();
  return day === 0 || day === 6;
}

// ============================================================
// コンポーネント
// ============================================================

export function DailyDetailsTable({ data, kpiTarget }: DailyDetailsTableProps) {
  // 今日までのデータのみフィルタ
  const today = new Date().toISOString().split('T')[0];
  const filteredData = useMemo(() => {
    return data.filter((d) => d.date <= today);
  }, [data, today]);

  // 合計を計算
  const totals = useMemo(() => {
    return filteredData.reduce(
      (acc, d) => ({
        revenue: acc.revenue + d.revenue,
        lineRegistrations: acc.lineRegistrations + d.lineRegistrations,
        frontendPurchases: acc.frontendPurchases + d.frontendPurchases,
        backendPurchases: acc.backendPurchases + d.backendPurchases,
      }),
      { revenue: 0, lineRegistrations: 0, frontendPurchases: 0, backendPurchases: 0 }
    );
  }, [filteredData]);

  // 達成率を計算
  const achievementRates = useMemo(() => {
    return {
      revenue: kpiTarget.targetRevenue > 0
        ? (totals.revenue / kpiTarget.targetRevenue) * 100
        : 0,
      lineRegistrations: kpiTarget.targetLineRegistrations > 0
        ? (totals.lineRegistrations / kpiTarget.targetLineRegistrations) * 100
        : 0,
      frontendPurchases: kpiTarget.targetFrontendPurchases > 0
        ? (totals.frontendPurchases / kpiTarget.targetFrontendPurchases) * 100
        : 0,
      backendPurchases: kpiTarget.targetBackendPurchases > 0
        ? (totals.backendPurchases / kpiTarget.targetBackendPurchases) * 100
        : 0,
    };
  }, [totals, kpiTarget]);

  if (data.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          デイリー詳細
        </h2>
        <p className="mt-4 text-center text-[color:var(--color-text-muted)]">
          データがありません
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
        デイリー詳細
      </h2>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-border)]">
              <th className="px-3 py-2 text-left font-medium text-[color:var(--color-text-secondary)]">
                日付
              </th>
              <th className="px-3 py-2 text-right font-medium text-[color:var(--color-text-secondary)]">
                売上
              </th>
              <th className="px-3 py-2 text-right font-medium text-[color:var(--color-text-secondary)]">
                LINE登録
              </th>
              <th className="px-3 py-2 text-right font-medium text-[color:var(--color-text-secondary)]">
                フロント
              </th>
              <th className="px-3 py-2 text-right font-medium text-[color:var(--color-text-secondary)]">
                バック
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((d) => (
              <tr
                key={d.date}
                className={`border-b border-[color:var(--color-border)]/50 ${
                  isWeekend(d.date) ? 'bg-[color:var(--color-surface-muted)]/50' : ''
                }`}
              >
                <td className="px-3 py-2 text-[color:var(--color-text-primary)]">
                  {formatDate(d.date)}
                </td>
                <td className="px-3 py-2 text-right text-[color:var(--color-text-primary)]">
                  {d.revenue > 0 ? formatCurrency(d.revenue) : '-'}
                </td>
                <td className="px-3 py-2 text-right text-[color:var(--color-text-primary)]">
                  {d.lineRegistrations > 0 ? `${formatNumber(d.lineRegistrations)}件` : '-'}
                </td>
                <td className="px-3 py-2 text-right text-[color:var(--color-text-primary)]">
                  {d.frontendPurchases > 0 ? `${formatNumber(d.frontendPurchases)}件` : '-'}
                </td>
                <td className="px-3 py-2 text-right text-[color:var(--color-text-primary)]">
                  {d.backendPurchases > 0 ? `${formatNumber(d.backendPurchases)}件` : '-'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {/* 合計行 */}
            <tr className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)]">
              <td className="px-3 py-2 font-semibold text-[color:var(--color-text-primary)]">
                合計
              </td>
              <td className="px-3 py-2 text-right font-semibold text-[color:var(--color-text-primary)]">
                {formatCurrency(totals.revenue)}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-[color:var(--color-text-primary)]">
                {formatNumber(totals.lineRegistrations)}件
              </td>
              <td className="px-3 py-2 text-right font-semibold text-[color:var(--color-text-primary)]">
                {formatNumber(totals.frontendPurchases)}件
              </td>
              <td className="px-3 py-2 text-right font-semibold text-[color:var(--color-text-primary)]">
                {formatNumber(totals.backendPurchases)}件
              </td>
            </tr>
            {/* 目標行 */}
            <tr className="border-b border-[color:var(--color-border)]">
              <td className="px-3 py-2 text-[color:var(--color-text-secondary)]">
                目標
              </td>
              <td className="px-3 py-2 text-right text-[color:var(--color-text-secondary)]">
                {formatCurrency(kpiTarget.targetRevenue)}
              </td>
              <td className="px-3 py-2 text-right text-[color:var(--color-text-secondary)]">
                {formatNumber(kpiTarget.targetLineRegistrations)}件
              </td>
              <td className="px-3 py-2 text-right text-[color:var(--color-text-secondary)]">
                {formatNumber(kpiTarget.targetFrontendPurchases)}件
              </td>
              <td className="px-3 py-2 text-right text-[color:var(--color-text-secondary)]">
                {formatNumber(kpiTarget.targetBackendPurchases)}件
              </td>
            </tr>
            {/* 達成率行 */}
            <tr>
              <td className="px-3 py-2 text-[color:var(--color-text-secondary)]">
                達成率
              </td>
              <td className={`px-3 py-2 text-right font-semibold ${
                achievementRates.revenue >= 100 ? 'text-green-600' : 'text-[color:var(--color-accent)]'
              }`}>
                {achievementRates.revenue.toFixed(1)}%
              </td>
              <td className={`px-3 py-2 text-right font-semibold ${
                achievementRates.lineRegistrations >= 100 ? 'text-green-600' : 'text-[color:var(--color-accent)]'
              }`}>
                {achievementRates.lineRegistrations.toFixed(1)}%
              </td>
              <td className={`px-3 py-2 text-right font-semibold ${
                achievementRates.frontendPurchases >= 100 ? 'text-green-600' : 'text-[color:var(--color-accent)]'
              }`}>
                {achievementRates.frontendPurchases.toFixed(1)}%
              </td>
              <td className={`px-3 py-2 text-right font-semibold ${
                achievementRates.backendPurchases >= 100 ? 'text-green-600' : 'text-[color:var(--color-accent)]'
              }`}>
                {achievementRates.backendPurchases.toFixed(1)}%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  );
}
