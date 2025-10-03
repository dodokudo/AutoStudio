'use client';

import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { classNames } from '@/lib/classNames';

interface AccountInsightsCardProps {
  data: {
    posts: number;
    views: number;
    likes: number;
    newFollowers: number;
    previousPosts?: number;
    previousViews?: number;
    previousLikes?: number;
    previousNewFollowers?: number;
  };
  note?: string;
  filterControl?: ReactNode;
}

export function AccountInsightsCard({ data, note, filterControl }: AccountInsightsCardProps) {

  const formatDelta = (current: number, previous?: number) => {
    if (previous === undefined) return null;
    const delta = current - previous;
    const isPositive = delta > 0;
    const isNeutral = delta === 0;

    return {
      text: isNeutral ? '変化なし' : `${isPositive ? '+' : ''}${delta.toLocaleString()}`,
      className: isNeutral ? 'text-[color:var(--color-text-muted)]' : isPositive ? 'text-[#096c3e]' : 'text-[#a61b1b]',
    };
  };

  const metrics = [
    {
      label: '投稿',
      value: data.posts,
      previous: data.previousPosts,
      suffix: '件',
    },
    {
      label: '閲覧',
      value: data.views,
      previous: data.previousViews,
      suffix: '',
    },
    {
      label: 'いいね',
      value: data.likes,
      previous: data.previousLikes,
      suffix: '',
    },
    {
      label: '新規フォロワー',
      value: data.newFollowers,
      previous: data.previousNewFollowers,
      suffix: '人',
    },
  ];

  return (
    <Card>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">アカウントインサイト</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
            {note ?? '選択した期間の主要指標を確認できます。'}
          </p>
        </div>
        {filterControl ? (
          <div className="flex items-center gap-3 text-xs text-[color:var(--color-text-secondary)]">
            {filterControl}
          </div>
        ) : null}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const delta = formatDelta(metric.value, metric.previous);
          return (
            <div key={metric.label} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4 shadow-[var(--shadow-soft)]">
              <p className="text-xs font-medium text-[color:var(--color-text-secondary)] uppercase tracking-[0.08em]">
                {metric.label}
              </p>
              <p className="mt-3 text-2xl font-semibold text-[color:var(--color-text-primary)]">
                {metric.value.toLocaleString()}
                {metric.suffix}
              </p>
              {delta ? <p className={classNames('mt-2 text-xs font-medium', delta.className)}>{delta.text}</p> : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
