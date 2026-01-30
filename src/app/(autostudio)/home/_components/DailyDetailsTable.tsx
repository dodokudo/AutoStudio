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
  threadsFollowerDelta: number;
  instagramFollowerDelta: number;
  frontendPurchases: number;
  backendPurchases: number;
}

interface DailyDetailsTableProps {
  data: DailyData[];
  kpiTarget?: KpiTarget | null;
  daysElapsed: number;
  totalDays: number;
  followerTotals: {
    threadsCurrent: number;
    instagramCurrent: number;
    threadsStart: number;
    instagramStart: number;
  };
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

export function DailyDetailsTable({ data, kpiTarget, daysElapsed, totalDays, followerTotals }: DailyDetailsTableProps) {
  // 今日までのデータのみフィルタ
  const today = new Date().toISOString().split('T')[0];
  const filteredData = useMemo(() => {
    return data.filter((d) => d.date <= today);
  }, [data, today]);

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredData]);

  // 合計を計算
  const totals = useMemo(() => {
    return filteredData.reduce(
      (acc, d) => ({
        revenue: acc.revenue + d.revenue,
        lineRegistrations: acc.lineRegistrations + d.lineRegistrations,
        threadsFollowerDelta: acc.threadsFollowerDelta + d.threadsFollowerDelta,
        instagramFollowerDelta: acc.instagramFollowerDelta + d.instagramFollowerDelta,
        frontendPurchases: acc.frontendPurchases + d.frontendPurchases,
        backendPurchases: acc.backendPurchases + d.backendPurchases,
      }),
      { revenue: 0, lineRegistrations: 0, threadsFollowerDelta: 0, instagramFollowerDelta: 0, frontendPurchases: 0, backendPurchases: 0 }
    );
  }, [filteredData]);

  // 達成率を計算
  const achievementRates = useMemo(() => {
    if (!kpiTarget) {
      return null;
    }
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
                Threads
              </th>
              <th className="px-3 py-2 text-right font-medium text-[color:var(--color-text-secondary)]">
                Instagram
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
              <th className="px-3 py-2 text-right font-medium text-[color:var(--color-text-secondary)]">
                売上
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)]">
              <td className="px-3 py-2 font-semibold text-[color:var(--color-text-primary)]">
                合計
              </td>
              <td className="px-3 py-2 text-right font-semibold text-[color:var(--color-text-primary)]">
                {formatNumber(totals.threadsFollowerDelta)}人
              </td>
              <td className="px-3 py-2 text-right font-semibold text-[color:var(--color-text-primary)]">
                {formatNumber(totals.instagramFollowerDelta)}人
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
              <td className="px-3 py-2 text-right font-semibold text-[color:var(--color-text-primary)]">
                {formatCurrency(totals.revenue)}
              </td>
            </tr>

            {kpiTarget ? (
              <>
                <tr className="border-b border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)]/40">
                  <td className="px-3 py-2 text-[color:var(--color-text-secondary)]">
                    目標
                  </td>
                  <td className="px-3 py-2 text-right text-[color:var(--color-text-secondary)]">
                    {formatNumber(kpiTarget.targetThreadsFollowers)}人
                  </td>
                  <td className="px-3 py-2 text-right text-[color:var(--color-text-secondary)]">
                    {formatNumber(kpiTarget.targetInstagramFollowers)}人
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
                  <td className="px-3 py-2 text-right text-[color:var(--color-text-secondary)]">
                    {formatCurrency(kpiTarget.targetRevenue)}
                  </td>
                </tr>
                {achievementRates ? (
                  <tr className="border-b border-[color:var(--color-border)] bg-[color:var(--color-accent)]/5">
                    <td className="px-3 py-2 text-[color:var(--color-text-secondary)]">
                      達成率
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${
                      kpiTarget.targetThreadsFollowers > 0 && totals.threadsFollowerDelta >= kpiTarget.targetThreadsFollowers ? 'text-green-600' : 'text-[color:var(--color-accent)]'
                    }`}>
                      {kpiTarget.targetThreadsFollowers > 0
                        ? `${((totals.threadsFollowerDelta / kpiTarget.targetThreadsFollowers) * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${
                      kpiTarget.targetInstagramFollowers > 0 && totals.instagramFollowerDelta >= kpiTarget.targetInstagramFollowers ? 'text-green-600' : 'text-[color:var(--color-accent)]'
                    }`}>
                      {kpiTarget.targetInstagramFollowers > 0
                        ? `${((totals.instagramFollowerDelta / kpiTarget.targetInstagramFollowers) * 100).toFixed(1)}%`
                        : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${
                      achievementRates.lineRegistrations >= 100 ? 'text-green-600' : 'text-[color:var(--color-accent)]'
                    }`}>
                      {kpiTarget.targetLineRegistrations > 0 ? `${achievementRates.lineRegistrations.toFixed(1)}%` : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${
                      achievementRates.frontendPurchases >= 100 ? 'text-green-600' : 'text-[color:var(--color-accent)]'
                    }`}>
                      {kpiTarget.targetFrontendPurchases > 0 ? `${achievementRates.frontendPurchases.toFixed(1)}%` : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${
                      achievementRates.backendPurchases >= 100 ? 'text-green-600' : 'text-[color:var(--color-accent)]'
                    }`}>
                      {kpiTarget.targetBackendPurchases > 0 ? `${achievementRates.backendPurchases.toFixed(1)}%` : '—'}
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold ${
                      achievementRates.revenue >= 100 ? 'text-green-600' : 'text-[color:var(--color-accent)]'
                    }`}>
                      {kpiTarget.targetRevenue > 0 ? `${achievementRates.revenue.toFixed(1)}%` : '—'}
                    </td>
                  </tr>
                ) : null}
              </>
            ) : null}

            {sortedData.map((d) => (
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
                  {formatNumber(d.threadsFollowerDelta)}人
                </td>
                <td className="px-3 py-2 text-right text-[color:var(--color-text-primary)]">
                  {formatNumber(d.instagramFollowerDelta)}人
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
                <td className="px-3 py-2 text-right text-[color:var(--color-text-primary)]">
                  {d.revenue > 0 ? formatCurrency(d.revenue) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
