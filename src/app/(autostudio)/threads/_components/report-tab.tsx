'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { classNames } from '@/lib/classNames';

interface TopPost {
  content: string;
  impressions: number;
  likes: number;
  postedAt: string;
}

interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  weekNumber: number;
  totalPosts: number;
  totalImpressions: number;
  totalLikes: number;
  winnerCount: number;
  winRate: number;
  avgImpressions: number;
  avgLikeRate: number;
  followerStart: number;
  followerEnd: number;
  followerChange: number;
  lineRegistrations: number;
  dailyAvgPosts: number;
  topPost?: TopPost;
}

interface MonthlyReport {
  month: string;
  monthLabel: string;
  totalPosts: number;
  totalImpressions: number;
  totalLikes: number;
  winnerCount: number;
  winRate: number;
  avgImpressions: number;
  avgLikeRate: number;
  followerStart: number;
  followerEnd: number;
  followerChange: number;
  lineRegistrations: number;
  dailyAvgPosts: number;
  weeklyBreakdown: WeeklyReport[];
  topPosts: TopPost[];
}

type ReportType = 'weekly' | 'monthly';

const fetcher = (url: string) => fetch(url).then(res => res.json());

function formatNumber(value: number): string {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}万`;
  }
  return value.toLocaleString();
}

function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.getMonth() + 1}/${startDate.getDate()} - ${endDate.getMonth() + 1}/${endDate.getDate()}`;
}

interface ReportTabProps {
  startDate: string;
  endDate: string;
}

function MetricCard({ label, value, subValue, trend }: {
  label: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  const trendColors = {
    up: 'text-[#137a4c]',
    down: 'text-[#b42318]',
    neutral: 'text-[color:var(--color-text-muted)]',
  };

  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
      <dt className="text-xs font-medium text-[color:var(--color-text-secondary)] uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-2 text-2xl font-semibold text-[color:var(--color-text-primary)]">
        {value}
      </dd>
      {subValue && (
        <p className={classNames('mt-1 text-xs', trend ? trendColors[trend] : 'text-[color:var(--color-text-muted)]')}>
          {subValue}
        </p>
      )}
    </div>
  );
}

function WeeklyReportCard({ report }: { report: WeeklyReport }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="overflow-hidden">
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">
            第{report.weekNumber}週
          </h3>
          <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">
            {formatDateRange(report.weekStart, report.weekEnd)}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-lg font-semibold text-[color:var(--color-text-primary)]">
              {formatNumber(report.totalImpressions)}
            </p>
            <p className="text-xs text-[color:var(--color-text-secondary)]">インプレッション</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-[color:var(--color-text-primary)]">
              +{report.followerChange}
            </p>
            <p className="text-xs text-[color:var(--color-text-secondary)]">フォロワー</p>
          </div>
          <svg
            className={classNames('h-5 w-5 text-[color:var(--color-text-muted)] transition-transform', expanded && 'rotate-180')}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 border-t border-[color:var(--color-border)] pt-4">
          <dl className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <MetricCard label="投稿数" value={`${report.totalPosts}件`} subValue={`日平均 ${report.dailyAvgPosts.toFixed(1)}件`} />
            <MetricCard label="勝ち投稿" value={`${report.winnerCount}件`} subValue={`勝率 ${formatPercent(report.winRate)}`} />
            <MetricCard label="平均imp" value={formatNumber(report.avgImpressions)} />
            <MetricCard label="LINE登録" value={`${report.lineRegistrations}件`} />
          </dl>

          {report.topPost && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-[color:var(--color-text-primary)]">今週のトップ投稿</h4>
              <div className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3">
                <div className="flex items-center justify-between text-xs text-[color:var(--color-text-secondary)]">
                  <span>{report.topPost.postedAt}</span>
                  <span>{formatNumber(report.topPost.impressions)} imp / {report.topPost.likes} likes</span>
                </div>
                <p className="mt-2 text-sm text-[color:var(--color-text-primary)] line-clamp-3">
                  {report.topPost.content}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function MonthlyReportCard({ report }: { report: MonthlyReport }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="overflow-hidden">
      <div
        className="flex cursor-pointer items-center justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <h3 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
            {report.monthLabel}
          </h3>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-xl font-semibold text-[color:var(--color-text-primary)]">
              {formatNumber(report.totalImpressions)}
            </p>
            <p className="text-xs text-[color:var(--color-text-secondary)]">インプレッション</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold text-[color:var(--color-text-primary)]">
              +{formatNumber(report.followerChange)}
            </p>
            <p className="text-xs text-[color:var(--color-text-secondary)]">フォロワー</p>
          </div>
          <svg
            className={classNames('h-5 w-5 text-[color:var(--color-text-muted)] transition-transform', expanded && 'rotate-180')}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="mt-4 border-t border-[color:var(--color-border)] pt-4">
          <dl className="grid gap-3 sm:grid-cols-2 md:grid-cols-5">
            <MetricCard label="投稿数" value={`${report.totalPosts}件`} subValue={`日平均 ${report.dailyAvgPosts.toFixed(1)}件`} />
            <MetricCard label="勝ち投稿" value={`${report.winnerCount}件`} subValue={`勝率 ${formatPercent(report.winRate)}`} />
            <MetricCard label="平均imp" value={formatNumber(report.avgImpressions)} />
            <MetricCard label="LINE登録" value={`${report.lineRegistrations}件`} />
            <MetricCard
              label="フォロワー推移"
              value={`${formatNumber(report.followerEnd)}`}
              subValue={`${report.followerStart.toLocaleString()} → ${report.followerEnd.toLocaleString()}`}
              trend={report.followerChange > 0 ? 'up' : report.followerChange < 0 ? 'down' : 'neutral'}
            />
          </dl>

          {report.topPosts.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-[color:var(--color-text-primary)]">
                勝ち投稿 TOP{report.topPosts.length}
              </h4>
              <div className="mt-2 space-y-2">
                {report.topPosts.map((post, index) => (
                  <div
                    key={index}
                    className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3"
                  >
                    <div className="flex items-center justify-between text-xs text-[color:var(--color-text-secondary)]">
                      <span>#{index + 1} {post.postedAt}</span>
                      <span className="font-medium text-[color:var(--color-accent)]">
                        {formatNumber(post.impressions)} imp / {post.likes} likes
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-[color:var(--color-text-primary)] line-clamp-2">
                      {post.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {report.weeklyBreakdown.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-medium text-[color:var(--color-text-primary)]">週別内訳</h4>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[600px] text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-text-secondary)]">
                      <th className="pb-2 font-medium">週</th>
                      <th className="pb-2 text-right font-medium">投稿数</th>
                      <th className="pb-2 text-right font-medium">imp</th>
                      <th className="pb-2 text-right font-medium">勝ち</th>
                      <th className="pb-2 text-right font-medium">フォロワー</th>
                      <th className="pb-2 text-right font-medium">LINE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[color:var(--color-border)]">
                    {report.weeklyBreakdown.map((week) => (
                      <tr key={week.weekStart} className="text-[color:var(--color-text-primary)]">
                        <td className="py-2">{formatDateRange(week.weekStart, week.weekEnd)}</td>
                        <td className="py-2 text-right">{week.totalPosts}</td>
                        <td className="py-2 text-right">{formatNumber(week.totalImpressions)}</td>
                        <td className="py-2 text-right">{week.winnerCount}</td>
                        <td className="py-2 text-right text-[#137a4c]">+{week.followerChange}</td>
                        <td className="py-2 text-right">{week.lineRegistrations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export function ReportTab({ startDate, endDate }: ReportTabProps) {
  const [reportType, setReportType] = useState<ReportType>('weekly');

  const { data, error, isLoading } = useSWR(
    `/api/threads/report?type=${reportType}&startDate=${startDate}&endDate=${endDate}`,
    fetcher
  );

  return (
    <div className="section-stack">
      <Card>
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">運用レポート</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
              Threads運用の週次・月次パフォーマンスレポート
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-1">
              <button
                onClick={() => setReportType('weekly')}
                className={classNames(
                  'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                  reportType === 'weekly'
                    ? 'bg-[color:var(--color-accent)] text-white'
                    : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
                )}
              >
                週次
              </button>
              <button
                onClick={() => setReportType('monthly')}
                className={classNames(
                  'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                  reportType === 'monthly'
                    ? 'bg-[color:var(--color-accent)] text-white'
                    : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
                )}
              >
                月次
              </button>
            </div>
          </div>
        </header>
      </Card>

      {isLoading ? (
        <Card>
          <div className="flex items-center justify-center py-12">
            <div className="text-sm text-[color:var(--color-text-muted)]">レポートを読み込み中...</div>
          </div>
        </Card>
      ) : error ? (
        <Card>
          <div className="rounded-[var(--radius-md)] border border-[#fecdd3] bg-[#fef2f2] p-4 text-sm text-[#b42318]">
            レポートの取得に失敗しました。時間をおいて再度お試しください。
          </div>
        </Card>
      ) : data?.reports?.length === 0 ? (
        <Card>
          <div className="flex items-center justify-center py-12">
            <div className="text-sm text-[color:var(--color-text-muted)]">
              選択した期間のレポートデータがありません。
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {reportType === 'weekly' ? (
            (data?.reports as WeeklyReport[])?.map((report) => (
              <WeeklyReportCard key={report.weekStart} report={report} />
            ))
          ) : (
            (data?.reports as MonthlyReport[])?.map((report) => (
              <MonthlyReportCard key={report.month} report={report} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
