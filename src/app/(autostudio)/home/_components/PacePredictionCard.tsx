'use client';

import { Card } from '@/components/ui/card';
import type { PacePrediction } from '@/lib/home/kpi-types';

// ============================================================
// 型定義
// ============================================================

interface PacePredictionCardProps {
  predictions: {
    revenue: PacePrediction;
    lineRegistrations: PacePrediction;
  };
  daysElapsed: number;
  totalDays: number;
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

// ============================================================
// コンポーネント
// ============================================================

export function PacePredictionCard({ predictions, daysElapsed, totalDays }: PacePredictionCardProps) {
  const remainingDays = totalDays - daysElapsed;

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
        今月ペース予測
      </h2>
      <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
        現在のペースで月末までに達成できる予測値です。（{daysElapsed}日経過 / {totalDays}日）
      </p>

      <div className="mt-5 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
        <p className="text-sm font-medium text-[color:var(--color-text-primary)]">
          このままのペースだと...
        </p>

        <div className="mt-4 space-y-3">
          {/* 売上予測 */}
          <div className="flex items-center justify-between">
            <span className="text-[color:var(--color-text-secondary)]">売上</span>
            <span className="font-semibold text-[color:var(--color-text-primary)]">
              {formatCurrency(predictions.revenue.projectedMonthEnd)}
              <span className="ml-2 text-sm text-[color:var(--color-text-muted)]">
                ({predictions.revenue.projectedAchievementRate.toFixed(0)}%着地)
              </span>
            </span>
          </div>

          {/* LINE登録予測 */}
          <div className="flex items-center justify-between">
            <span className="text-[color:var(--color-text-secondary)]">LINE登録</span>
            <span className="font-semibold text-[color:var(--color-text-primary)]">
              {formatNumber(predictions.lineRegistrations.projectedMonthEnd)}件
              <span className="ml-2 text-sm text-[color:var(--color-text-muted)]">
                ({predictions.lineRegistrations.projectedAchievementRate.toFixed(0)}%着地)
              </span>
            </span>
          </div>
        </div>
      </div>

      {remainingDays > 0 && (
        <div className="mt-4 rounded-lg border border-[color:var(--color-accent)]/20 bg-[color:var(--color-accent)]/5 p-4">
          <p className="text-sm font-medium text-[color:var(--color-text-primary)]">
            目標達成に必要な残り日数あたりの数字
          </p>

          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[color:var(--color-text-secondary)]">売上</span>
              <span className="font-semibold text-[color:var(--color-accent)]">
                1日あたり {formatCurrency(predictions.revenue.requiredDailyRate)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[color:var(--color-text-secondary)]">LINE登録</span>
              <span className="font-semibold text-[color:var(--color-accent)]">
                1日あたり {predictions.lineRegistrations.requiredDailyRate.toFixed(1)}件
              </span>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
