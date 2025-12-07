'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { classNames } from '@/lib/classNames';

interface PatternStats {
  pattern: string;
  count: number;
  avgImpressions: number;
  avgLikes: number;
  examples: Array<{ text: string; impressions: number }>;
}

interface AnalysisData {
  totalPosts: number;
  avgImpressions: number;
  avgLikes: number;
  patternAnalysis: PatternStats[];
  startDate: string;
  endDate: string;
}

interface PostAnalysisCardProps {
  startDate: string;
  endDate: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
};

export function PostAnalysisCard({ startDate, endDate }: PostAnalysisCardProps) {
  const { data, error, isLoading } = useSWR<AnalysisData>(
    startDate && endDate ? `/api/threads/post-analysis?startDate=${startDate}&endDate=${endDate}` : null,
    fetcher
  );

  const numberFormatter = new Intl.NumberFormat('ja-JP');

  const maxPatternAvg = useMemo(() => {
    if (!data?.patternAnalysis?.length) return 0;
    return Math.max(...data.patternAnalysis.map((p) => p.avgImpressions));
  }, [data]);

  const topPattern = data?.patternAnalysis?.[0];

  // 期間表示用
  const formatDateRange = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    const fmt = new Intl.DateTimeFormat('ja-JP', { month: 'short', day: 'numeric' });
    return `${fmt.format(s)} 〜 ${fmt.format(e)}`;
  };

  if (error) {
    return (
      <Card>
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-red-500">分析データの取得に失敗しました</p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-[color:var(--color-text-muted)]">分析中...</p>
        </div>
      </Card>
    );
  }

  if (!data || data.totalPosts === 0) {
    return (
      <Card>
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
            冒頭パターン分析
          </h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
            投稿の1行目のパターン別パフォーマンスを分析します
          </p>
        </div>
        <div className="mt-6 flex h-32 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)]">
          <p className="text-sm text-[color:var(--color-text-muted)]">
            表示できるデータがまだありません。
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          冒頭パターン分析
        </h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          投稿の1行目のパターン別パフォーマンス（{formatDateRange(data.startDate, data.endDate)}・{data.totalPosts}件）
        </p>
      </div>

      {/* サマリーカード */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-secondary)]">
            全体の平均インプレッション
          </p>
          <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text-primary)]">
            {numberFormatter.format(data.avgImpressions)}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
            最強の冒頭パターン
          </p>
          <p className="mt-2 text-xl font-semibold text-amber-900">
            {topPattern?.pattern ?? '-'}
          </p>
          <p className="mt-1 text-sm text-amber-700">
            平均 {numberFormatter.format(topPattern?.avgImpressions ?? 0)} imp（{topPattern?.count ?? 0}件）
          </p>
        </div>
      </div>

      {/* パターン別バー */}
      <div className="mt-6">
        <h3 className="mb-3 text-sm font-medium text-[color:var(--color-text-primary)]">
          パターン別パフォーマンス
        </h3>
        <div className="space-y-3">
          {data.patternAnalysis.map((stat, index) => {
            const widthPercent = maxPatternAvg > 0 ? (stat.avgImpressions / maxPatternAvg) * 100 : 0;
            const isTop = index === 0;
            const isOther = stat.pattern === 'その他';
            return (
              <div key={stat.pattern}>
                <div className="flex items-center gap-3">
                  <span
                    className={classNames(
                      'w-28 shrink-0 text-xs',
                      isTop
                        ? 'font-semibold text-amber-700'
                        : isOther
                          ? 'text-[color:var(--color-text-muted)]'
                          : 'text-[color:var(--color-text-secondary)]'
                    )}
                  >
                    {stat.pattern}
                  </span>
                  <div className="flex-1">
                    <div className="h-5 overflow-hidden rounded bg-gray-100">
                      <div
                        className={classNames(
                          'h-full transition-all',
                          isTop ? 'bg-amber-500' : isOther ? 'bg-gray-300' : 'bg-indigo-500'
                        )}
                        style={{ width: `${widthPercent}%` }}
                      />
                    </div>
                  </div>
                  <span className="w-16 text-right text-xs font-medium text-[color:var(--color-text-primary)]">
                    {numberFormatter.format(stat.avgImpressions)}
                  </span>
                  <span className="w-12 text-right text-[10px] text-[color:var(--color-text-muted)]">
                    ({stat.count}件)
                  </span>
                </div>
                {stat.examples.length > 0 && (isTop || isOther) && (
                  <div className="ml-28 mt-1 space-y-0.5 pl-3">
                    {stat.examples.slice(0, isOther ? 2 : 1).map((ex, i) => (
                      <p key={i} className="text-[10px] text-[color:var(--color-text-muted)]">
                        例: {ex.text}...
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* インサイト */}
      <div className="mt-6 rounded-[var(--radius-md)] border border-indigo-200 bg-indigo-50 p-4">
        <p className="text-xs font-medium text-indigo-700">分析インサイト</p>
        <p className="mt-1 text-sm text-indigo-900">
          「{topPattern?.pattern}」パターンが最も効果的（平均の
          {Math.round((topPattern?.avgImpressions ?? 0) / data.avgImpressions * 100)}%増）。
          このパターンを意識した冒頭を増やすと効果的です。
        </p>
      </div>
    </Card>
  );
}
