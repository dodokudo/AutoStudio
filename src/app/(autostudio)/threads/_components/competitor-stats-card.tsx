'use client';

import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { classNames } from '@/lib/classNames';

interface CompetitorStats {
  accountName: string;
  username: string;
  currentFollowers: number;
  followerDelta: number;
  dailyFollowerDelta: number;
  totalImpressions: number;
  totalLikes: number;
  postCount: number;
  avgImpressions: number;
  avgLikes: number;
  latestPostDate: string;
  isSelf: boolean;
}

interface CompetitorStatsResponse {
  competitors: CompetitorStats[];
  startDate: string;
  endDate: string;
  totalAccounts: number;
}

interface CompetitorStatsCardProps {
  startDate: string;
  endDate: string;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
};

export function CompetitorStatsCard({ startDate, endDate }: CompetitorStatsCardProps) {
  const { data, error, isLoading } = useSWR<CompetitorStatsResponse>(
    startDate && endDate ? `/api/threads/competitor-stats?startDate=${startDate}&endDate=${endDate}` : null,
    fetcher
  );

  const numberFormatter = new Intl.NumberFormat('ja-JP');

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
          <p className="text-sm text-red-500">競合データの取得に失敗しました</p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-[color:var(--color-text-muted)]">読み込み中...</p>
        </div>
      </Card>
    );
  }

  if (!data || data.competitors.length === 0) {
    return (
      <Card>
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
            競合アカウント パフォーマンス
          </h2>
        </div>
        <div className="mt-6 flex h-32 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)]">
          <p className="text-sm text-[color:var(--color-text-muted)]">
            表示できるデータがありません
          </p>
        </div>
      </Card>
    );
  }

  // 最高パフォーマンスを見つける
  const topByImpressions = data.competitors.reduce((a, b) =>
    a.avgImpressions > b.avgImpressions ? a : b
  );
  const topByFollowerGrowth = data.competitors.reduce((a, b) =>
    a.followerDelta > b.followerDelta ? a : b
  );

  return (
    <Card>
      <div>
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
          競合アカウント パフォーマンス
        </h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          {formatDateRange(data.startDate, data.endDate)}（{data.totalAccounts}アカウント）
        </p>
      </div>

      {/* サマリー */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
            平均インプ最高
          </p>
          <p className="mt-1 text-lg font-semibold text-emerald-900">
            {topByImpressions.accountName}
          </p>
          <p className="text-sm text-emerald-700">
            平均 {numberFormatter.format(topByImpressions.avgImpressions)} imp
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-blue-700">
            フォロワー増加最多
          </p>
          <p className="mt-1 text-lg font-semibold text-blue-900">
            {topByFollowerGrowth.accountName}
          </p>
          <p className="text-sm text-blue-700">
            +{numberFormatter.format(topByFollowerGrowth.followerDelta)} フォロワー
          </p>
        </div>
      </div>

      {/* アカウント一覧テーブル */}
      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-left text-xs uppercase tracking-wide text-[color:var(--color-text-secondary)]">
              <th className="pb-2 pr-4">アカウント</th>
              <th className="pb-2 px-2 text-right">フォロワー</th>
              <th className="pb-2 px-2 text-right">増加数</th>
              <th className="pb-2 px-2 text-right">日次増加</th>
              <th className="pb-2 px-2 text-right">投稿数</th>
              <th className="pb-2 px-2 text-right">合計imp</th>
              <th className="pb-2 px-2 text-right">平均imp</th>
              <th className="pb-2 pl-2 text-right">平均likes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[color:var(--color-border)]">
            {data.competitors.map((comp) => (
              <tr
                key={comp.username}
                className={classNames(
                  'hover:bg-[color:var(--color-surface-muted)]',
                  comp.isSelf && 'bg-indigo-50 border-l-4 border-l-indigo-500'
                )}
              >
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-2">
                    {comp.isSelf && (
                      <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                        自分
                      </span>
                    )}
                    <div>
                      <p className="font-medium text-[color:var(--color-text-primary)]">
                        {comp.accountName}
                      </p>
                      <p className="text-xs text-[color:var(--color-text-muted)]">
                        @{comp.username}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="py-3 px-2 text-right text-[color:var(--color-text-secondary)]">
                  {numberFormatter.format(comp.currentFollowers)}
                </td>
                <td className="py-3 px-2 text-right">
                  <span className={classNames(
                    comp.followerDelta > 0 ? 'text-green-600' : 'text-[color:var(--color-text-secondary)]'
                  )}>
                    {comp.followerDelta > 0 ? '+' : ''}{numberFormatter.format(comp.followerDelta)}
                  </span>
                </td>
                <td className="py-3 px-2 text-right">
                  <span className={classNames(
                    comp.dailyFollowerDelta > 0 ? 'text-green-600' : 'text-[color:var(--color-text-secondary)]'
                  )}>
                    {comp.dailyFollowerDelta > 0 ? '+' : ''}{comp.dailyFollowerDelta.toFixed(1)}/日
                  </span>
                </td>
                <td className="py-3 px-2 text-right text-[color:var(--color-text-secondary)]">
                  {comp.postCount}
                </td>
                <td className="py-3 px-2 text-right text-[color:var(--color-text-secondary)]">
                  {numberFormatter.format(comp.totalImpressions)}
                </td>
                <td className="py-3 px-2 text-right font-medium text-[color:var(--color-text-primary)]">
                  {numberFormatter.format(comp.avgImpressions)}
                </td>
                <td className="py-3 pl-2 text-right text-[color:var(--color-text-secondary)]">
                  {numberFormatter.format(comp.avgLikes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
