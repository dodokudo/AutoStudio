'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';

// ============================================================
// 型定義
// ============================================================

interface FunnelStage {
  stage: string;
  users: number;
}

interface FunnelConversionCardProps {
  stages: FunnelStage[];
}

// ============================================================
// ユーティリティ
// ============================================================

const numberFormatter = new Intl.NumberFormat('ja-JP');

function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}

// ============================================================
// コンポーネント
// ============================================================

export function FunnelConversionCard({ stages }: FunnelConversionCardProps) {
  // 転換率を計算
  const stagesWithConversion = useMemo(() => {
    return stages.map((stage, index) => {
      const prevUsers = index > 0 ? stages[index - 1].users : stage.users;
      const conversionRate = prevUsers > 0 ? (stage.users / prevUsers) * 100 : 0;
      return {
        ...stage,
        conversionRate,
        isFirst: index === 0,
      };
    });
  }, [stages]);

  if (stages.length === 0) {
    return null;
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
        ファネル転換率（今月）
      </h2>
      <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
        各ステップの転換率を表示しています。
      </p>

      <div className="mt-5">
        {/* ファネル図 */}
        <div className="flex items-center justify-between overflow-x-auto pb-4">
          {stagesWithConversion.map((stage, index) => (
            <div key={stage.stage} className="flex items-center">
              {/* ステージボックス */}
              <div className="flex flex-col items-center min-w-[100px]">
                <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-4 py-3 text-center">
                  <p className="text-xs text-[color:var(--color-text-muted)]">{stage.stage}</p>
                  <p className="mt-1 text-lg font-bold text-[color:var(--color-text-primary)]">
                    {formatNumber(stage.users)}件
                  </p>
                </div>
              </div>

              {/* 矢印と転換率 */}
              {index < stagesWithConversion.length - 1 && (
                <div className="flex flex-col items-center mx-2">
                  <span className="text-[color:var(--color-text-muted)]">→</span>
                  <span className="text-xs font-medium text-[color:var(--color-accent)]">
                    {stagesWithConversion[index + 1].conversionRate.toFixed(0)}%
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
