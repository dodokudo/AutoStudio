'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InstagramDashboardData } from '@/lib/instagram/dashboard';
import LoadingScreen from '@/components/LoadingScreen';
import { useDateRange, DatePreset } from '@/lib/dateRangeStore';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { classNames } from '@/lib/classNames';

interface Props {
  data: InstagramDashboardData;
}

const presetLabels: Record<DatePreset, string> = {
  yesterday: '昨日',
  'this-week': '今週',
  'last-week': '先週',
  'this-month': '今月',
  'last-month': '先月',
  custom: 'カスタム',
  all: '全期間',
};

const formatDateForInput = (date?: Date | null): string => {
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return local.toISOString().split('T')[0];
};

const parseDate = (dateStr: string) => {
  if (!dateStr || typeof dateStr !== 'string') {
    return null;
  }

  try {
    const str = dateStr.trim();

    const isoMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (isoMatch) {
      const [, year, month, day] = isoMatch;
      return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    }

    const isoDateTimeMatch = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T\s]/);
    if (isoDateTimeMatch) {
      const [, year, month, day] = isoDateTimeMatch;
      return new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
    }

    return null;
  } catch (error) {
    console.error('parseDate エラー:', error, '元値:', dateStr);
    return null;
  }
};

const formatDisplayDate = (timestamp?: string | null): string => {
  if (!timestamp) return '日付未登録';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '日付未登録';
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric' });
};

const formatDateKey = (date?: Date | null): string | null => {
  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const isWithinDateRange = (dateKey: string, startKey: string | null, endKey: string | null): boolean => {
  if (!dateKey) {
    return false;
  }
  if (!startKey || !endKey) {
    return true;
  }
  return dateKey >= startKey && dateKey <= endKey;
};

const normalizeMediaUrl = (raw?: string | null): string | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.includes('lh3.googleusercontent.com')) {
    return trimmed;
  }

  const fileIdMatch = trimmed.match(/\/file\/d\/([^/]+)\//);
  if (fileIdMatch?.[1]) {
    return `https://lh3.googleusercontent.com/d/${fileIdMatch[1]}`;
  }

  const idParamMatch = trimmed.match(/[?&]id=([^&]+)/);
  if (idParamMatch?.[1]) {
    return `https://lh3.googleusercontent.com/d/${idParamMatch[1]}`;
  }

  if (trimmed.startsWith('http')) {
    return trimmed;
  }

  return null;
};

const resolveMediaUrl = (...urls: Array<string | null | undefined>): string | null => {
  for (const candidate of urls) {
    const normalized = normalizeMediaUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
};

export function InstagramDashboardView({ data }: Props) {
  const { dateRange, updatePreset } = useDateRange();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'reels' | 'stories' | 'scripts'>('dashboard');
  const [customStartDate, setCustomStartDate] = useState(() => formatDateForInput(dateRange.start));
  const [customEndDate, setCustomEndDate] = useState(() => formatDateForInput(dateRange.end));
  const [showCustomDateModal, setShowCustomDateModal] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [reelSortBy, setReelSortBy] = useState('date');
  const [reelSortOrder, setReelSortOrder] = useState<'asc' | 'desc'>('desc');
  const [storySortBy, setStorySortBy] = useState('date');
  const [storySortOrder, setStorySortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setCustomStartDate(formatDateForInput(dateRange.start));
    setCustomEndDate(formatDateForInput(dateRange.end));
  }, [dateRange.start, dateRange.end, dateRange.preset]);

  const filteredReels = useMemo(() => {
    if (dateRange.preset === 'all') return data.reels;

    return data.reels.filter((reel) => {
      if (!reel.timestamp) return false;
      const reelDate = parseDate(reel.timestamp);
      if (!reelDate) return false;

      return reelDate >= dateRange.start && reelDate <= dateRange.end;
    });
  }, [data.reels, dateRange]);

  const filteredStories = useMemo(() => {
    if (dateRange.preset === 'all') return data.stories;

    return data.stories.filter((story) => {
      if (!story.timestamp) return false;
      const storyDate = parseDate(story.timestamp);
      if (!storyDate) return false;

      return storyDate >= dateRange.start && storyDate <= dateRange.end;
    });
  }, [data.stories, dateRange]);

  const sortedReels = useMemo(() => {
    const sorted = [...filteredReels].sort((a, b) => {
      let aValue: number | string | null = 0;
      let bValue: number | string | null = 0;

      switch (reelSortBy) {
        case 'date':
          aValue = a.timestamp || '';
          bValue = b.timestamp || '';
          break;
        case 'views':
          aValue = a.views || 0;
          bValue = b.views || 0;
          break;
        case 'likes':
          aValue = a.likeCount || 0;
          bValue = b.likeCount || 0;
          break;
        case 'saves':
          aValue = a.saved || 0;
          bValue = b.saved || 0;
          break;
        case 'comments':
          aValue = a.commentsCount || 0;
          bValue = b.commentsCount || 0;
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return reelSortOrder === 'desc' ? bValue - aValue : aValue - bValue;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return reelSortOrder === 'desc' ? bValue.localeCompare(aValue) : aValue.localeCompare(bValue);
      }

      return 0;
    });

    return sorted;
  }, [filteredReels, reelSortBy, reelSortOrder]);

  const followerByDate = useMemo(() => {
    return data.followerSeries.reduce<Record<string, number>>((acc, point) => {
      acc[point.date] = point.followers ?? 0;
      return acc;
    }, {});
  }, [data.followerSeries]);

  const resolveFollowerCount = useCallback((timestamp?: string | null): number | null => {
    if (!timestamp) return null;
    const date = parseDate(timestamp);
    if (!date) return null;
    const key = formatDateKey(date);
    if (!key) return null;
    const value = followerByDate[key];
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  }, [followerByDate]);

  const computeViewRate = useCallback((timestamp?: string | null, views?: number | null): number | null => {
    const followers = resolveFollowerCount(timestamp);
    if (!followers || !views) return null;
    return views / followers;
  }, [resolveFollowerCount]);

  const sortedStories = useMemo(() => {
    const sorted = [...filteredStories].sort((a, b) => {
      let aValue: number | string | null = 0;
      let bValue: number | string | null = 0;

      switch (storySortBy) {
        case 'date':
          aValue = a.timestamp || '';
          bValue = b.timestamp || '';
          break;
        case 'views':
          aValue = a.views || 0;
          bValue = b.views || 0;
          break;
        case 'viewRate': {
          const aFollowers = resolveFollowerCount(a.timestamp);
          const bFollowers = resolveFollowerCount(b.timestamp);
          const aRate = aFollowers && a.views ? a.views / aFollowers : null;
          const bRate = bFollowers && b.views ? b.views / bFollowers : null;
          aValue = aRate ?? 0;
          bValue = bRate ?? 0;
          break;
        }
        case 'reactions':
          aValue = a.replies || 0;
          bValue = b.replies || 0;
          break;
        default:
          return 0;
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return storySortOrder === 'desc' ? bValue - aValue : aValue - bValue;
      }

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return storySortOrder === 'desc' ? bValue.localeCompare(aValue) : aValue.localeCompare(bValue);
      }

      return 0;
    });

    return sorted;
  }, [filteredStories, storySortBy, storySortOrder, resolveFollowerCount]);
  const summary = useMemo(() => {
    const startKey = formatDateKey(dateRange.start);
    const endKey = formatDateKey(dateRange.end);
    const useAllRange = dateRange.preset === 'all';

    const followerSeriesInRange = useAllRange
      ? data.followerSeries
      : data.followerSeries.filter((point) => isWithinDateRange(point.date, startKey, endKey));

    const followerSeriesAsc = [...followerSeriesInRange].sort((a, b) => a.date.localeCompare(b.date));
    const latestFollowerPoint =
      followerSeriesAsc[followerSeriesAsc.length - 1] ?? data.latestFollower;

    const earliestFollowerPoint =
      followerSeriesAsc[0]
      ?? (data.followerSeries.length > 0
        ? data.followerSeries[data.followerSeries.length - 1]
        : data.latestFollower);

    const followerGrowth =
      latestFollowerPoint && earliestFollowerPoint
        ? (latestFollowerPoint.followers ?? 0) - (earliestFollowerPoint.followers ?? 0)
        : 0;

    const reachTotal = followerSeriesInRange.reduce((sum, point) => sum + (point.reach ?? 0), 0);
    const engagementTotal = followerSeriesInRange.reduce((sum, point) => sum + (point.engagement ?? 0), 0);

    let lineRegistrations: number | null = null;
    if (data.lineRegistrationSeries.length > 0) {
      const lineSeriesInRange = useAllRange
        ? data.lineRegistrationSeries
        : data.lineRegistrationSeries.filter((point) => isWithinDateRange(point.date, startKey, endKey));
      lineRegistrations = lineSeriesInRange.reduce((sum, point) => sum + (point.count ?? 0), 0);
    } else if (data.lineRegistrationCount !== null) {
      lineRegistrations = data.lineRegistrationCount;
    }

    return {
      currentFollowers: latestFollowerPoint?.followers ?? 0,
      followerGrowth,
      latestReach: reachTotal,
      latestEngagement: engagementTotal,
      totalReels: filteredReels.length,
      totalStories: filteredStories.length,
      lineRegistrations,
    };
  }, [data, dateRange, filteredReels, filteredStories]);

  const tabItems = [
    { value: 'dashboard', label: '概要' },
    { value: 'reels', label: 'リール' },
    { value: 'stories', label: 'ストーリー' },
    { value: 'scripts', label: '台本' },
  ] as const;

  const rangeSummary =
    dateRange.preset === 'custom'
      ? `${formatDateForInput(dateRange.start)} 〜 ${formatDateForInput(dateRange.end)}`
      : presetLabels[dateRange.preset];

  if (!mounted) {
    return <LoadingScreen />;
  }

  return (
    <div className="section-stack mx-auto max-w-6xl pb-12">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {tabItems.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={classNames(
                'h-9 rounded-[var(--radius-sm)] px-3 text-sm font-medium transition-colors',
                activeTab === tab.value
                  ? 'bg-[color:var(--color-text-primary)] text-white'
                  : 'border border-[color:var(--color-border)] bg-white text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-surface-muted)]',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={dateRange.preset}
            onChange={(event) => {
              const value = event.target.value as DatePreset;
              if (value === 'custom') {
                setCustomStartDate(formatDateForInput(dateRange.start));
                setCustomEndDate(formatDateForInput(dateRange.end));
                setShowCustomDateModal(true);
              } else {
                updatePreset(value);
              }
            }}
            className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
          >
            <option value="yesterday">昨日</option>
            <option value="this-week">今週</option>
            <option value="last-week">先週</option>
            <option value="this-month">今月</option>
            <option value="last-month">先月</option>
            <option value="custom">カスタム期間</option>
          </select>
          <span className="text-xs text-[color:var(--color-text-muted)]">{rangeSummary}</span>
        </div>
      </div>

      {activeTab === 'dashboard' && (
        <>
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">アカウント概要</h2>
            <div className="mt-4 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-secondary)]">フォロワー</p>
                <p className="mt-3 text-2xl font-semibold text-[color:var(--color-text-primary)]">
                  {summary.currentFollowers.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  増減 {summary.followerGrowth === 0 ? '±0' : `${summary.followerGrowth > 0 ? '+' : ''}${summary.followerGrowth.toLocaleString()}`}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-secondary)]">リーチ</p>
                <p className="mt-3 text-2xl font-semibold text-[color:var(--color-text-primary)]">
                  {summary.latestReach.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">期間内合計</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-secondary)]">エンゲージメント</p>
                <p className="mt-3 text-2xl font-semibold text-[color:var(--color-text-primary)]">
                  {summary.latestEngagement.toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">期間内合計</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-secondary)]">LINE登録数</p>
                <p className="mt-3 text-2xl font-semibold text-[color:var(--color-text-primary)]">
                  {summary.lineRegistrations !== null ? summary.lineRegistrations.toLocaleString() : '—'}
                </p>
                <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  {summary.lineRegistrations !== null && summary.latestReach > 0
                    ? `遷移率 ${(summary.lineRegistrations / summary.latestReach * 100).toFixed(2)}%`
                    : '期間内合計'}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">フォロワー推移</h2>
              <span className="text-xs text-[color:var(--color-text-muted)]">
                最新 {data.followerSeries.length > 0 ? data.followerSeries[0].date : '—'}
              </span>
            </div>
            <div className="mt-4 h-72">
              {data.followerSeries.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.followerSeries.slice().reverse()} margin={{ top: 12, right: 20, left: 24, bottom: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={{ stroke: '#D1D5DB' }} />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 12, fill: '#6B7280' }}
                      axisLine={{ stroke: '#D1D5DB' }}
                      tickFormatter={(value) => value.toLocaleString()}
                    />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="followers" fill="#8B5CF6" name="フォロワー" />
                    <Line yAxisId="left" type="monotone" dataKey="reach" stroke="#10B981" name="リーチ" strokeWidth={2} />
                    <Line yAxisId="left" type="monotone" dataKey="engagement" stroke="#F59E0B" name="エンゲージメント" strokeWidth={2} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-[color:var(--color-text-muted)]">データがありません</div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">リールTOP5</h2>
                <p className="text-xs text-[color:var(--color-text-muted)]">期間内の上位コンテンツ</p>
              </div>
              <Button variant="secondary" className="h-9 px-3 text-sm" onClick={() => setActiveTab('reels')}>
                詳細
              </Button>
            </div>
            {sortedReels.length > 0 ? (
              <div className="mt-4 flex gap-4 overflow-x-auto pb-1">
                {sortedReels.slice(0, 5).map((reel) => {
                  const thumbnailUrl = resolveMediaUrl(reel.thumbnailUrl, reel.driveImageUrl);
                  const viewRate = computeViewRate(reel.timestamp, reel.views ?? null);
                  return (
                    <div
                      key={reel.instagramId}
                      className="flex min-w-[220px] flex-shrink-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white shadow-sm"
                    >
                      <div className="relative aspect-[9/16] w-full bg-[color:var(--color-surface-muted)]">
                        {thumbnailUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-3 p-3">
                        <p className="text-xs text-[color:var(--color-text-muted)]">{formatDisplayDate(reel.timestamp)}</p>
                        <dl className="space-y-2 text-sm text-[color:var(--color-text-secondary)]">
                          <div className="flex items-center justify-between">
                            <dt className="font-medium text-[color:var(--color-text-muted)]">閲覧数</dt>
                            <dd className="font-semibold text-[color:var(--color-text-primary)]">
                              {reel.views?.toLocaleString() ?? '—'}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between">
                            <dt className="font-medium text-[color:var(--color-text-muted)]">閲覧率</dt>
                            <dd className="font-semibold text-[color:var(--color-text-primary)]">
                              {viewRate !== null ? `${(viewRate * 100).toFixed(1)}%` : '—'}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-6 text-center text-sm text-[color:var(--color-text-muted)]">
                リールデータがありません
              </div>
            )}
          </Card>

          <Card className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">ストーリーTOP5</h2>
                <p className="text-xs text-[color:var(--color-text-muted)]">期間内の上位コンテンツ</p>
              </div>
              <Button variant="secondary" className="h-9 px-3 text-sm" onClick={() => setActiveTab('stories')}>
                詳細
              </Button>
            </div>
            {sortedStories.length > 0 ? (
              <div className="mt-4 flex gap-4 overflow-x-auto pb-1">
                {sortedStories.slice(0, 5).map((story) => {
                  const thumbnailUrl = resolveMediaUrl(story.thumbnailUrl, story.driveImageUrl);
                  const viewRate = computeViewRate(story.timestamp, story.views ?? null);
                  return (
                    <div
                      key={story.instagramId}
                      className="flex min-w-[220px] flex-shrink-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white shadow-sm"
                    >
                      <div className="relative aspect-[9/16] w-full bg-[color:var(--color-surface-muted)]">
                        {thumbnailUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-3 p-3">
                        <p className="text-xs text-[color:var(--color-text-muted)]">{formatDisplayDate(story.timestamp)}</p>
                        <dl className="space-y-2 text-sm text-[color:var(--color-text-secondary)]">
                          <div className="flex items-center justify-between">
                            <dt className="font-medium text-[color:var(--color-text-muted)]">閲覧数</dt>
                            <dd className="font-semibold text-[color:var(--color-text-primary)]">
                              {story.views?.toLocaleString() ?? '—'}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between">
                            <dt className="font-medium text-[color:var(--color-text-muted)]">閲覧率</dt>
                            <dd className="font-semibold text-[color:var(--color-text-primary)]">
                              {viewRate !== null ? `${(viewRate * 100).toFixed(1)}%` : '—'}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-6 text-center text-sm text-[color:var(--color-text-muted)]">
                ストーリーデータがありません
              </div>
            )}
          </Card>
        </>
      )}

      {activeTab === 'reels' && (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">リール一覧</h2>
              <p className="text-xs text-[color:var(--color-text-muted)]">表示件数 {sortedReels.length}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={reelSortBy}
                onChange={(event) => setReelSortBy(event.target.value)}
                className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
              >
                <option value="date">日付</option>
                <option value="views">再生数</option>
                <option value="likes">いいね</option>
                <option value="saves">保存</option>
                <option value="comments">コメント</option>
              </select>
              <Button
                variant="secondary"
                className="h-9 px-3 text-sm"
                onClick={() => setReelSortOrder(reelSortOrder === 'desc' ? 'asc' : 'desc')}
              >
                {reelSortOrder === 'desc' ? '降順' : '昇順'}
              </Button>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            {sortedReels.map((reel) => {
              const thumbnailUrl = resolveMediaUrl(reel.thumbnailUrl, reel.driveImageUrl);
              return (
                <div key={reel.instagramId} className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4 sm:flex-row">
                  <div className="h-40 w-full overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] sm:w-32">
                    {thumbnailUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : null}
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-text-muted)]">
                      <span>{reel.timestamp ? new Date(reel.timestamp).toLocaleString('ja-JP') : '日付未登録'}</span>
                      {reel.permalink ? (
                        <a
                          href={reel.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-[color:var(--color-accent)] hover:text-[color:var(--color-accent-hover)]"
                        >
                          Instagramで開く
                        </a>
                      ) : null}
                    </div>
                    <p className="text-sm font-medium text-[color:var(--color-text-primary)] line-clamp-2">
                      {reel.caption || 'キャプションなし'}
                    </p>
                    <dl className="grid grid-cols-2 gap-y-2 text-sm text-[color:var(--color-text-secondary)] sm:grid-cols-3">
                      <div>
                        <dt>再生数</dt>
                        <dd className="font-semibold text-[color:var(--color-text-primary)]">{reel.views?.toLocaleString() ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>リーチ</dt>
                        <dd className="font-semibold text-[color:var(--color-text-primary)]">{reel.reach?.toLocaleString() ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>いいね</dt>
                        <dd className="font-semibold text-[color:var(--color-text-primary)]">{reel.likeCount?.toLocaleString() ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>コメント</dt>
                        <dd className="font-semibold text-[color:var(--color-text-primary)]">{reel.commentsCount?.toLocaleString() ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>保存</dt>
                        <dd className="font-semibold text-[color:var(--color-text-primary)]">{reel.saved?.toLocaleString() ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>シェア</dt>
                        <dd className="font-semibold text-[color:var(--color-text-primary)]">{reel.shares?.toLocaleString() ?? '—'}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              );
            })}
            {sortedReels.length === 0 && (
              <div className="rounded-[var(--radius-sm)] border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-text-muted)]">
                リールデータがありません
              </div>
            )}
          </div>
        </Card>
      )}

      {activeTab === 'stories' && (
        <Card className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">ストーリー一覧</h2>
              <p className="text-xs text-[color:var(--color-text-muted)]">表示件数 {sortedStories.length}</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={storySortBy}
                onChange={(event) => setStorySortBy(event.target.value)}
                className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
              >
                <option value="date">日付</option>
                <option value="views">閲覧数</option>
                <option value="viewRate">閲覧率</option>
                <option value="reactions">リアクション</option>
              </select>
              <Button
                variant="secondary"
                className="h-9 px-3 text-sm"
                onClick={() => setStorySortOrder(storySortOrder === 'desc' ? 'asc' : 'desc')}
              >
                {storySortOrder === 'desc' ? '降順' : '昇順'}
              </Button>
            </div>
          </div>
          <div className="mt-6 space-y-4">
            {sortedStories.map((story) => {
              const thumbnailUrl = resolveMediaUrl(story.thumbnailUrl, story.driveImageUrl);
              const followerCount = resolveFollowerCount(story.timestamp);
              const viewRate =
                followerCount && story.views
                  ? story.views / followerCount
                  : null;
              return (
                <div key={story.instagramId} className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4 sm:flex-row">
                  <div className="h-40 w-full overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] sm:w-32">
                    {thumbnailUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                    ) : null}
                  </div>
                  <div className="flex-1 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-text-muted)]">
                      <span>{story.timestamp ? new Date(story.timestamp).toLocaleString('ja-JP') : '日付未登録'}</span>
                    </div>
                    <p className="text-sm font-medium text-[color:var(--color-text-primary)] line-clamp-2">
                      {story.caption || 'キャプションなし'}
                    </p>
                    <dl className="grid grid-cols-2 gap-y-2 text-sm text-[color:var(--color-text-secondary)] sm:grid-cols-3">
                      <div>
                        <dt>閲覧数</dt>
                        <dd className="font-semibold text-[color:var(--color-text-primary)]">{story.views?.toLocaleString() ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>リーチ</dt>
                        <dd className="font-semibold text-[color:var(--color-text-primary)]">{story.reach?.toLocaleString() ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>閲覧率</dt>
                        <dd className="font-semibold text-[color:var(--color-text-primary)]">
                          {viewRate !== null ? `${(viewRate * 100).toFixed(1)}%` : '—'}
                        </dd>
                      </div>
                      <div>
                        <dt>返信</dt>
                        <dd className="font-semibold text-[color:var(--color-text-primary)]">{story.replies?.toLocaleString() ?? '—'}</dd>
                      </div>
                      <div>
                        <dt>プロフィール訪問</dt>
                        <dd className="font-semibold text-[color:var(--color-text-primary)]">
                          {story.profileVisits?.toLocaleString() ?? '—'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              );
            })}
            {sortedStories.length === 0 && (
              <div className="rounded-[var(--radius-sm)] border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-text-muted)]">
                ストーリーデータがありません
              </div>
            )}
          </div>
        </Card>
      )}

      {activeTab === 'scripts' && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">リール台本案</h2>
          {data.scripts.length > 0 ? (
            <div className="mt-4 space-y-4">
              {data.scripts.map((script, index) => (
                <div key={index} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4">
                  <h3 className="text-base font-medium text-[color:var(--color-text-primary)]">{script.title}</h3>
                  <div className="mt-3 space-y-2 text-sm text-[color:var(--color-text-secondary)]">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">Hook</p>
                      <p className="mt-1 whitespace-pre-line">{script.hook}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">Body</p>
                      <p className="mt-1 whitespace-pre-line">{script.body}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">CTA</p>
                      <p className="mt-1">{script.cta}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">Story</p>
                      <p className="mt-1 whitespace-pre-line">{script.storyText}</p>
                    </div>
                    {script.inspirationSources.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">Inspiration</p>
                        <p className="mt-1">{script.inspirationSources.join(', ')}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[var(--radius-sm)] border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-text-muted)]">
              台本データがありません
            </div>
          )}
        </Card>
      )}

      {showCustomDateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">カスタム期間を設定</h3>
            <p className="mt-2 text-xs text-[color:var(--color-text-secondary)]">表示したい期間の開始日と終了日を選択してください。</p>
            <div className="mt-4 space-y-3">
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-text-secondary)]">
                開始日
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(event) => setCustomStartDate(event.target.value)}
                  className="h-10 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-text-secondary)]">
                終了日
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(event) => setCustomEndDate(event.target.value)}
                  className="h-10 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="secondary" className="h-9 px-4 text-sm" onClick={() => setShowCustomDateModal(false)}>
                キャンセル
              </Button>
              <Button
                className="h-9 px-4 text-sm"
                onClick={() => {
                  if (customStartDate && customEndDate) {
                    updatePreset('custom', new Date(customStartDate), new Date(customEndDate));
                  }
                  setShowCustomDateModal(false);
                }}
                disabled={!customStartDate || !customEndDate}
              >
                適用
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
