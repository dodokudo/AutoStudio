'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { LinkStats } from '@/lib/links/types';

interface LinkStatsViewProps {
  linkId: string;
}

export function LinkStatsView({ linkId }: LinkStatsViewProps) {
  const [stats, setStats] = useState<LinkStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [linkId]);

  const loadStats = async () => {
    try {
      const response = await fetch(`/api/links/stats/${linkId}`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div className="text-sm text-[color:var(--color-text-secondary)]">読み込み中...</div>;
  }

  if (!stats) {
    return <div className="text-sm text-[color:var(--color-text-secondary)]">統計の読み込みに失敗しました</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[color:var(--color-text-primary)]">リンク統計</h1>
        <Link
          href="/links"
          className="text-sm text-blue-600 hover:underline"
        >
          リンク一覧に戻る
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
          <div className="text-sm text-[color:var(--color-text-secondary)]">総クリック数</div>
          <div className="mt-2 text-3xl font-bold text-[color:var(--color-text-primary)]">
            {stats.totalClicks.toLocaleString()}
          </div>
        </div>

        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
          <div className="text-sm text-[color:var(--color-text-secondary)]">今日</div>
          <div className="mt-2 text-3xl font-bold text-[color:var(--color-text-primary)]">
            {stats.clicksToday.toLocaleString()}
          </div>
        </div>

        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
          <div className="text-sm text-[color:var(--color-text-secondary)]">今週</div>
          <div className="mt-2 text-3xl font-bold text-[color:var(--color-text-primary)]">
            {stats.clicksThisWeek.toLocaleString()}
          </div>
        </div>

        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
          <div className="text-sm text-[color:var(--color-text-secondary)]">今月</div>
          <div className="mt-2 text-3xl font-bold text-[color:var(--color-text-primary)]">
            {stats.clicksThisMonth.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)] mb-4">
            上位の参照元
          </h2>
          <div className="space-y-2">
            {stats.clicksByReferrer.length === 0 ? (
              <p className="text-sm text-[color:var(--color-text-secondary)]">データがありません</p>
            ) : (
              stats.clicksByReferrer.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-[color:var(--color-text-primary)] truncate max-w-xs">
                    {item.referrer}
                  </span>
                  <span className="text-sm font-medium text-[color:var(--color-text-secondary)]">
                    {item.clicks}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)] mb-4">
            デバイス種別
          </h2>
          <div className="space-y-2">
            {stats.clicksByDevice.length === 0 ? (
              <p className="text-sm text-[color:var(--color-text-secondary)]">データがありません</p>
            ) : (
              stats.clicksByDevice.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <span className="text-sm text-[color:var(--color-text-primary)]">
                    {item.deviceType}
                  </span>
                  <span className="text-sm font-medium text-[color:var(--color-text-secondary)]">
                    {item.clicks}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)] mb-4">
          日別クリック数（過去30日間）
        </h2>
        <div className="space-y-2">
          {stats.clicksByDate.length === 0 ? (
            <p className="text-sm text-[color:var(--color-text-secondary)]">データがありません</p>
          ) : (
            stats.clicksByDate.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm text-[color:var(--color-text-primary)]">
                  {item.date}
                </span>
                <span className="text-sm font-medium text-[color:var(--color-text-secondary)]">
                  {item.clicks}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
