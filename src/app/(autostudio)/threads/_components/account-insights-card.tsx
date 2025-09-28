'use client';

import { useState } from 'react';

interface AccountInsightsCardProps {
  data: {
    posts: number;
    views: number;
    replies: number;
    interactions: number;
    newFollowers: number;
    previousPosts?: number;
    previousViews?: number;
    previousReplies?: number;
    previousInteractions?: number;
    previousNewFollowers?: number;
  };
  onPeriodChange?: (period: string) => void;
}

const PERIOD_OPTIONS = [
  { label: '3日間', value: '3d' },
  { label: '7日間', value: '7d' },
  { label: '30日間', value: '30d' },
];

export function AccountInsightsCard({ data, onPeriodChange }: AccountInsightsCardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState('7d');

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period);
    onPeriodChange?.(period);
  };

  const formatDelta = (current: number, previous?: number) => {
    if (previous === undefined) return null;
    const delta = current - previous;
    const isPositive = delta > 0;
    const isNeutral = delta === 0;

    return {
      value: Math.abs(delta),
      isPositive,
      isNeutral,
      text: isNeutral ? '変化なし' : `${isPositive ? '+' : '-'}${Math.abs(delta).toLocaleString()}`
    };
  };

  const metrics = [
    {
      label: '投稿',
      value: data.posts,
      previous: data.previousPosts,
      icon: '📱',
    },
    {
      label: '閲覧',
      value: data.views,
      previous: data.previousViews,
      icon: '👁️',
    },
    {
      label: '返信',
      value: data.replies,
      previous: data.previousReplies,
      icon: '💬',
    },
    {
      label: 'インタラクション',
      value: data.interactions,
      previous: data.previousInteractions,
      icon: '💫',
    },
    {
      label: '新規フォロワー',
      value: data.newFollowers,
      previous: data.previousNewFollowers,
      icon: '👥',
    },
  ];

  return (
    <div className="relative overflow-hidden rounded-[36px] border border-white/60 bg-white/90 px-8 py-10 shadow-[0_30px_70px_rgba(125,145,211,0.25)] dark:bg-white/10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-10 top-[-50px] h-48 w-48 rounded-full bg-gradient-to-br from-indigo-400/50 via-purple-300/40 to-white/0 blur-3xl" />
        <div className="absolute right-[-40px] top-10 h-40 w-40 rounded-full bg-gradient-to-br from-emerald-300/40 via-sky-200/30 to-white/0 blur-3xl" />
      </div>

      <div className="relative">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-[0_10px_20px_rgba(99,102,241,0.25)]">
              📈
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
              アカウントインサイト
            </h3>
          </div>

          <select
            value={selectedPeriod}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className="px-4 py-2 text-sm border border-white/30 rounded-2xl bg-white/70 backdrop-blur-sm text-slate-700 dark:bg-white/10 dark:border-white/20 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 shadow-[0_8px_16px_rgba(99,102,241,0.1)]"
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
          {metrics.map((metric) => {
            const delta = formatDelta(metric.value, metric.previous);

            return (
              <div
                key={metric.label}
                className="rounded-3xl border border-white/40 bg-white/85 p-6 shadow-[0_18px_38px_rgba(110,132,206,0.18)] backdrop-blur-sm dark:border-white/20 dark:bg-white/10"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xl">{metric.icon}</span>
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                    {metric.label}
                  </span>
                </div>

                <div className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
                  {metric.value.toLocaleString()}
                  {metric.label === '投稿' && '件'}
                </div>

                {delta && (
                  <div className={`text-xs font-medium rounded-full px-2.5 py-1 ${
                    delta.isNeutral
                      ? 'text-slate-500 bg-slate-100/60 dark:bg-slate-800/40'
                      : delta.isPositive
                      ? 'text-emerald-600 bg-emerald-100/60 dark:bg-emerald-500/20'
                      : 'text-red-500 bg-red-100/60 dark:bg-red-500/20'
                  }`}>
                    {delta.isNeutral ? (
                      '変化なし'
                    ) : (
                      <>
                        {delta.isPositive ? '↑' : '↓'} 前期: {metric.previous?.toLocaleString()}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}