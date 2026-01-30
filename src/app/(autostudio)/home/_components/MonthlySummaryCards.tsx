'use client';

import { Card } from '@/components/ui/card';
import { dashboardCardClass } from '@/components/dashboard/styles';
import type { KpiProgress } from '@/lib/home/kpi-types';

// ============================================================
// 型定義
// ============================================================

interface MonthlySummaryCardsProps {
  summary: {
    revenue: KpiProgress;
    lineRegistrations: KpiProgress;
    frontendPurchases: KpiProgress;
    backendPurchases: KpiProgress;
  } | null;
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

function getStatusColor(paceStatus: 'on_track' | 'behind' | 'ahead'): string {
  switch (paceStatus) {
    case 'ahead':
      return 'text-green-600';
    case 'behind':
      return 'text-red-600';
    default:
      return 'text-[color:var(--color-text-muted)]';
  }
}

function getStatusLabel(paceStatus: 'on_track' | 'behind' | 'ahead'): string {
  switch (paceStatus) {
    case 'ahead':
      return '順調';
    case 'behind':
      return '未達';
    default:
      return '予定通り';
  }
}

// ============================================================
// コンポーネント
// ============================================================

function SummaryCard({
  label,
  actual,
  target,
  achievementRate,
  paceStatus,
  formatValue = formatNumber,
  unit = '',
}: {
  label: string;
  actual: number;
  target: number;
  achievementRate: number;
  paceStatus: 'on_track' | 'behind' | 'ahead';
  formatValue?: (value: number) => string;
  unit?: string;
}) {
  const statusColor = getStatusColor(paceStatus);
  const statusLabel = getStatusLabel(paceStatus);

  return (
    <Card className={dashboardCardClass}>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold text-[color:var(--color-text-primary)]">
        {formatValue(actual)}{unit}
      </p>
      <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
        / {formatValue(target)}{unit}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-lg font-bold text-[color:var(--color-text-primary)]">
          {achievementRate.toFixed(0)}%
        </span>
        <span className={`text-xs font-medium ${statusColor}`}>
          {paceStatus === 'behind' ? '▼' : paceStatus === 'ahead' ? '▲' : '●'} {statusLabel}
        </span>
      </div>
      {/* プログレスバー */}
      <div className="mt-2 h-2 w-full rounded-full bg-[color:var(--color-border)]">
        <div
          className="h-full rounded-full bg-[color:var(--color-accent)] transition-all duration-300"
          style={{ width: `${Math.min(100, achievementRate)}%` }}
        />
      </div>
    </Card>
  );
}

export function MonthlySummaryCards({ summary }: MonthlySummaryCardsProps) {
  if (!summary) {
    return null;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)] mb-4">
        今月サマリー
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="売上"
          actual={summary.revenue.actual}
          target={summary.revenue.target}
          achievementRate={summary.revenue.achievementRate}
          paceStatus={summary.revenue.paceStatus}
          formatValue={formatCurrency}
        />
        <SummaryCard
          label="LINE登録"
          actual={summary.lineRegistrations.actual}
          target={summary.lineRegistrations.target}
          achievementRate={summary.lineRegistrations.achievementRate}
          paceStatus={summary.lineRegistrations.paceStatus}
          unit="件"
        />
        <SummaryCard
          label="フロント購入"
          actual={summary.frontendPurchases.actual}
          target={summary.frontendPurchases.target}
          achievementRate={summary.frontendPurchases.achievementRate}
          paceStatus={summary.frontendPurchases.paceStatus}
          unit="件"
        />
        <SummaryCard
          label="バックエンド"
          actual={summary.backendPurchases.actual}
          target={summary.backendPurchases.target}
          achievementRate={summary.backendPurchases.achievementRate}
          paceStatus={summary.backendPurchases.paceStatus}
          unit="件"
        />
      </div>
    </div>
  );
}
