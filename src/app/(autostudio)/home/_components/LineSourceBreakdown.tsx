'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';

// ============================================================
// 型定義
// ============================================================

interface SourceData {
  source: string;
  registrations: number;
}

interface LineSourceBreakdownProps {
  data: SourceData[];
}

// ============================================================
// ユーティリティ
// ============================================================

const numberFormatter = new Intl.NumberFormat('ja-JP');

function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}

// 色の定義
const SOURCE_COLORS: Record<string, string> = {
  スレッズ: 'bg-purple-500',
  Threads: 'bg-purple-500',
  インスタ: 'bg-pink-500',
  Instagram: 'bg-pink-500',
  YouTube: 'bg-red-500',
  その他: 'bg-gray-400',
  オーガニック: 'bg-emerald-500',
  organic: 'bg-gray-400',
};

function getSourceColor(source: string): string {
  return SOURCE_COLORS[source] || 'bg-gray-400';
}

// ============================================================
// コンポーネント
// ============================================================

export function LineSourceBreakdown({ data }: LineSourceBreakdownProps) {
  // 合計計算
  const total = useMemo(() => {
    return data.reduce((sum, item) => sum + item.registrations, 0);
  }, [data]);

  // パーセント付きデータ
  const dataWithPercent = useMemo(() => {
    return data
      .filter(item => item.registrations > 0)
      .map(item => ({
        ...item,
        percent: total > 0 ? (item.registrations / total) * 100 : 0,
      }))
      .sort((a, b) => b.registrations - a.registrations);
  }, [data, total]);

  if (dataWithPercent.length === 0) {
    return null;
  }

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
        LINE登録 流入元別（期間内）
      </h2>
      <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
        合計 {formatNumber(total)}件
      </p>

      <div className="mt-5 space-y-4">
        {dataWithPercent.map((item) => (
          <div key={item.source} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[color:var(--color-text-secondary)]">{item.source}</span>
              <span className="font-medium text-[color:var(--color-text-primary)]">
                {formatNumber(item.registrations)}件（{item.percent.toFixed(0)}%）
              </span>
            </div>
            {/* プログレスバー */}
            <div className="h-3 w-full rounded-full bg-[color:var(--color-border)]">
              <div
                className={`h-full rounded-full ${getSourceColor(item.source)} transition-all duration-300`}
                style={{ width: `${item.percent}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
