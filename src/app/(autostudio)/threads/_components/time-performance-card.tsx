'use client';

import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { classNames } from '@/lib/classNames';

interface PostData {
  postedAt: string;
  impressions: number;
  likes: number;
}

interface TimePerformanceCardProps {
  posts: PostData[];
}

const DAYS_OF_WEEK = ['日', '月', '火', '水', '木', '金', '土'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface HeatmapCell {
  dayIndex: number;
  hour: number;
  avgImpressions: number;
  postCount: number;
}

export function TimePerformanceCard({ posts }: TimePerformanceCardProps) {
  const { heatmapData, dayStats, hourStats, maxAvgImpressions } = useMemo(() => {
    // 曜日×時間帯のマトリクスを作成
    const matrix: Record<string, { totalImpressions: number; count: number }> = {};
    const dayTotals: Record<number, { totalImpressions: number; count: number }> = {};
    const hourTotals: Record<number, { totalImpressions: number; count: number }> = {};

    // 初期化
    for (let day = 0; day < 7; day++) {
      dayTotals[day] = { totalImpressions: 0, count: 0 };
      for (let hour = 0; hour < 24; hour++) {
        const key = `${day}-${hour}`;
        matrix[key] = { totalImpressions: 0, count: 0 };
        if (day === 0) {
          hourTotals[hour] = { totalImpressions: 0, count: 0 };
        }
      }
    }

    // 投稿データを集計
    posts.forEach((post) => {
      const date = new Date(post.postedAt);
      if (Number.isNaN(date.getTime())) return;

      const dayIndex = date.getDay();
      const hour = date.getHours();
      const impressions = post.impressions ?? 0;

      const key = `${dayIndex}-${hour}`;
      matrix[key].totalImpressions += impressions;
      matrix[key].count += 1;

      dayTotals[dayIndex].totalImpressions += impressions;
      dayTotals[dayIndex].count += 1;

      hourTotals[hour].totalImpressions += impressions;
      hourTotals[hour].count += 1;
    });

    // ヒートマップデータを生成
    const heatmapData: HeatmapCell[] = [];
    let maxAvg = 0;

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${day}-${hour}`;
        const { totalImpressions, count } = matrix[key];
        const avgImpressions = count > 0 ? totalImpressions / count : 0;
        maxAvg = Math.max(maxAvg, avgImpressions);
        heatmapData.push({
          dayIndex: day,
          hour,
          avgImpressions,
          postCount: count,
        });
      }
    }

    // 曜日別統計
    const dayStats = Object.entries(dayTotals).map(([day, data]) => ({
      dayIndex: Number(day),
      avgImpressions: data.count > 0 ? data.totalImpressions / data.count : 0,
      postCount: data.count,
    }));

    // 時間帯別統計
    const hourStats = Object.entries(hourTotals).map(([hour, data]) => ({
      hour: Number(hour),
      avgImpressions: data.count > 0 ? data.totalImpressions / data.count : 0,
      postCount: data.count,
    }));

    return { heatmapData, dayStats, hourStats, maxAvgImpressions: maxAvg };
  }, [posts]);

  const getHeatColor = (value: number, max: number): string => {
    if (max === 0 || value === 0) return 'bg-gray-100';
    const intensity = value / max;
    if (intensity >= 0.8) return 'bg-indigo-600';
    if (intensity >= 0.6) return 'bg-indigo-500';
    if (intensity >= 0.4) return 'bg-indigo-400';
    if (intensity >= 0.2) return 'bg-indigo-300';
    return 'bg-indigo-200';
  };

  const formatNumber = (value: number) => {
    if (value >= 10000) return `${(value / 1000).toFixed(1)}K`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return Math.round(value).toLocaleString();
  };

  const bestDay = dayStats.reduce((best, current) =>
    current.avgImpressions > best.avgImpressions ? current : best
  , dayStats[0]);

  const bestHours = hourStats
    .filter((h) => h.postCount > 0)
    .sort((a, b) => b.avgImpressions - a.avgImpressions)
    .slice(0, 3);

  const numberFormatter = new Intl.NumberFormat('ja-JP');

  return (
    <Card>
      <div>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          曜日・時間帯別パフォーマンス
        </h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          投稿時間ごとの平均インプレッションをヒートマップで表示します
        </p>
      </div>

      {posts.length === 0 ? (
        <div className="mt-6 flex h-48 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)]">
          <p className="text-sm text-[color:var(--color-text-muted)]">
            表示できるデータがまだありません。
          </p>
        </div>
      ) : (
        <>
          {/* サマリーカード */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                最も効果的な曜日
              </p>
              <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text-primary)]">
                {DAYS_OF_WEEK[bestDay.dayIndex]}曜日
              </p>
              <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                平均 {numberFormatter.format(Math.round(bestDay.avgImpressions))} imp / {bestDay.postCount}投稿
              </p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-secondary)]">
                最も効果的な時間帯
              </p>
              <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text-primary)]">
                {bestHours.length > 0 ? `${bestHours[0].hour}時台` : '-'}
              </p>
              <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                {bestHours.length > 0
                  ? `平均 ${numberFormatter.format(Math.round(bestHours[0].avgImpressions))} imp`
                  : 'データなし'}
              </p>
            </div>
          </div>

          {/* ヒートマップ */}
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-medium text-[color:var(--color-text-primary)]">
              時間帯 × 曜日 ヒートマップ
            </h3>
            <div className="overflow-x-auto">
              <div className="min-w-[600px]">
                {/* 時間帯ヘッダー */}
                <div className="flex">
                  <div className="w-10 shrink-0" />
                  {HOURS.filter((h) => h % 3 === 0).map((hour) => (
                    <div
                      key={hour}
                      className="flex-1 text-center text-[10px] text-[color:var(--color-text-secondary)]"
                      style={{ minWidth: '24px' }}
                    >
                      {hour}
                    </div>
                  ))}
                </div>

                {/* 曜日ごとの行 */}
                {DAYS_OF_WEEK.map((day, dayIndex) => (
                  <div key={day} className="flex items-center">
                    <div className="w-10 shrink-0 text-xs text-[color:var(--color-text-secondary)]">
                      {day}
                    </div>
                    <div className="flex flex-1 gap-[2px]">
                      {HOURS.map((hour) => {
                        const cell = heatmapData.find(
                          (c) => c.dayIndex === dayIndex && c.hour === hour
                        );
                        return (
                          <div
                            key={hour}
                            className={classNames(
                              'h-6 flex-1 rounded-sm transition-colors',
                              getHeatColor(cell?.avgImpressions ?? 0, maxAvgImpressions)
                            )}
                            title={`${day}曜 ${hour}時: ${cell?.postCount ?? 0}投稿, 平均${formatNumber(cell?.avgImpressions ?? 0)}imp`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* 凡例 */}
                <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-[color:var(--color-text-secondary)]">
                  <span>低</span>
                  <div className="flex gap-[2px]">
                    <div className="h-3 w-3 rounded-sm bg-gray-100" />
                    <div className="h-3 w-3 rounded-sm bg-indigo-200" />
                    <div className="h-3 w-3 rounded-sm bg-indigo-300" />
                    <div className="h-3 w-3 rounded-sm bg-indigo-400" />
                    <div className="h-3 w-3 rounded-sm bg-indigo-500" />
                    <div className="h-3 w-3 rounded-sm bg-indigo-600" />
                  </div>
                  <span>高</span>
                </div>
              </div>
            </div>
          </div>

          {/* 曜日別バーチャート */}
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-medium text-[color:var(--color-text-primary)]">
              曜日別 平均インプレッション
            </h3>
            <div className="space-y-2">
              {dayStats.map((stat) => {
                const maxDayAvg = Math.max(...dayStats.map((s) => s.avgImpressions));
                const widthPercent = maxDayAvg > 0 ? (stat.avgImpressions / maxDayAvg) * 100 : 0;
                return (
                  <div key={stat.dayIndex} className="flex items-center gap-3">
                    <span className="w-6 text-xs text-[color:var(--color-text-secondary)]">
                      {DAYS_OF_WEEK[stat.dayIndex]}
                    </span>
                    <div className="flex-1">
                      <div className="h-5 overflow-hidden rounded bg-gray-100">
                        <div
                          className="h-full bg-indigo-500 transition-all"
                          style={{ width: `${widthPercent}%` }}
                        />
                      </div>
                    </div>
                    <span className="w-16 text-right text-xs text-[color:var(--color-text-secondary)]">
                      {formatNumber(stat.avgImpressions)}
                    </span>
                    <span className="w-12 text-right text-[10px] text-[color:var(--color-text-muted)]">
                      ({stat.postCount}件)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
