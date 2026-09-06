'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table } from '@/components/ui/table';
import type { YoutubeCompetitorSummary, YoutubeCompetitorVideo } from '@/lib/youtube/dashboard';

type CompetitorCategory = 'ai' | 'threads';
type VideoFilter = 'signals' | 'long' | 'views' | 'ratio' | 'all';
type VideoSort = 'ratio' | 'views' | 'velocity' | 'duration' | 'newest';

interface YoutubeCompetitorPanelProps {
  competitors: YoutubeCompetitorSummary[];
  videos: YoutubeCompetitorVideo[];
}

const numberFormatter = new Intl.NumberFormat('ja-JP');
const decimalFormatter = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });

const FILTERS: Array<{ id: VideoFilter; label: string }> = [
  { id: 'signals', label: '注目動画' },
  { id: 'long', label: '15分以上' },
  { id: 'views', label: '1万再生以上' },
  { id: 'ratio', label: '登録者超え' },
  { id: 'all', label: 'すべて' },
];

const SORT_OPTIONS: Array<{ id: VideoSort; label: string }> = [
  { id: 'ratio', label: '再生倍率が高い順' },
  { id: 'views', label: '再生数が多い順' },
  { id: 'velocity', label: '1日平均が多い順' },
  { id: 'duration', label: '動画尺が長い順' },
  { id: 'newest', label: '新しい順' },
];

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  return numberFormatter.format(value);
}

function formatDuration(value: number | null) {
  if (!value || value <= 0) return '–';
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.round(value % 60);
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
    : `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function isStrongSignal(video: YoutubeCompetitorVideo) {
  const views = video.viewCount ?? 0;
  const ratio = video.performanceRatio ?? 0;
  return (video.durationSeconds ?? 0) >= 900 && (views >= 10_000 || (views >= 1_000 && ratio >= 1));
}

function matchesFilter(video: YoutubeCompetitorVideo, filter: VideoFilter) {
  if (filter === 'signals') return isStrongSignal(video);
  if (filter === 'long') return (video.durationSeconds ?? 0) >= 900;
  if (filter === 'views') return (video.viewCount ?? 0) >= 10_000;
  if (filter === 'ratio') return (video.viewCount ?? 0) >= 1_000 && (video.performanceRatio ?? 0) >= 1;
  return true;
}

export function YoutubeCompetitorPanel({ competitors, videos }: YoutubeCompetitorPanelProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const category: CompetitorCategory = searchParams.get('category') === 'ai' ? 'ai' : 'threads';
  const [videoFilter, setVideoFilter] = useState<VideoFilter>('signals');
  const [videoSort, setVideoSort] = useState<VideoSort>('ratio');

  useEffect(() => {
    setVideoFilter(category === 'threads' ? 'signals' : 'all');
  }, [category]);

  const categoryCompetitors = useMemo(
    () => competitors.filter((competitor) => competitor.category === category),
    [category, competitors],
  );
  const categoryVideos = useMemo(
    () => videos.filter((video) => video.category === category),
    [category, videos],
  );
  const filteredVideos = useMemo(
    () => [...categoryVideos.filter((video) => matchesFilter(video, videoFilter))].sort((a, b) => {
      const fallback = (b.viewCount ?? 0) - (a.viewCount ?? 0);
      if (videoSort === 'views') return fallback;
      if (videoSort === 'velocity') return ((b.viewVelocity ?? 0) - (a.viewVelocity ?? 0)) || fallback;
      if (videoSort === 'duration') return ((b.durationSeconds ?? 0) - (a.durationSeconds ?? 0)) || fallback;
      if (videoSort === 'newest') {
        return ((b.publishedAt ? new Date(b.publishedAt).getTime() : 0)
          - (a.publishedAt ? new Date(a.publishedAt).getTime() : 0)) || fallback;
      }
      return ((b.performanceRatio ?? 0) - (a.performanceRatio ?? 0)) || fallback;
    }),
    [categoryVideos, videoFilter, videoSort],
  );
  const strongVideoCount = useMemo(
    () => categoryVideos.filter(isStrongSignal).length,
    [categoryVideos],
  );

  function selectCategory(nextCategory: CompetitorCategory) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', 'competitors');
    params.set('category', nextCategory);
    window.history.pushState(null, '', `${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[color:var(--color-text-primary)]">競合チャンネル分析</h1>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
            登録した競合を分野別に分け、伸びた動画から企画の切り口を確認します。
          </p>
        </div>
        <div className="inline-flex rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-1">
          {([
            { id: 'ai' as const, label: 'AI系' },
            { id: 'threads' as const, label: 'Threads系' },
          ]).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={category === item.id}
              onClick={() => selectCategory(item.id)}
              className={`rounded-[calc(var(--radius-md)-4px)] px-4 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)] ${
                category === item.id
                  ? 'bg-[color:var(--color-text-primary)] text-[color:var(--color-surface)]'
                  : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-sm text-[color:var(--color-text-muted)]">登録チャンネル</p>
          <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text-primary)]">{categoryCompetitors.length}</p>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-[color:var(--color-text-muted)]">
            {category === 'threads' ? 'Threads関連動画' : '取得済み動画'}
          </p>
          <p className="mt-2 text-2xl font-semibold text-[color:var(--color-text-primary)]">{categoryVideos.length}</p>
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
            登録{categoryCompetitors.length}チャンネルから抽出
          </p>
        </Card>
        <Card className="border-[color:var(--color-accent)] p-5">
          <p className="text-sm text-[color:var(--color-text-muted)]">注目動画</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-2xl font-semibold text-[color:var(--color-accent)]">{strongVideoCount}</p>
            <p className="text-xs text-[color:var(--color-text-muted)]">15分以上かつ高反応</p>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="border-b border-[color:var(--color-border)] px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">伸びた動画</h2>
              <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                注目動画は15分以上で、1万再生または登録者数以上に再生された動画です。
              </p>
            </div>
            <div className="flex max-w-full flex-wrap items-center justify-end gap-3">
              <label className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
                並び替え
                <select
                  value={videoSort}
                  onChange={(event) => setVideoSort(event.target.value as VideoSort)}
                  className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-1.5 text-xs font-medium text-[color:var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </label>
              <div className="flex max-w-full flex-wrap gap-2" aria-label="動画フィルター">
                {FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    aria-pressed={videoFilter === filter.id}
                    onClick={() => setVideoFilter(filter.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)] ${
                      videoFilter === filter.id
                        ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]'
                        : 'border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:border-[color:var(--color-text-muted)]'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {filteredVideos.length ? (
          <div className="overflow-x-auto">
            <Table className="min-w-[980px] rounded-none text-xs">
              <thead className="bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3 text-left">動画</th>
                  <th className="px-4 py-3 text-right">尺</th>
                  <th className="px-4 py-3 text-right">再生数</th>
                  <th className="px-4 py-3 text-right">登録者</th>
                  <th className="px-4 py-3 text-right">再生倍率</th>
                  <th className="px-4 py-3 text-right">1日平均</th>
                  <th className="px-4 py-3 text-right">投稿日</th>
                </tr>
              </thead>
              <tbody>
                {filteredVideos.map((video) => (
                  <tr key={video.videoId} className="hover:bg-[color:var(--color-surface-muted)]">
                    <td className="px-4 py-3">
                      <div className="flex min-w-[360px] items-start gap-3">
                        <Image
                          src={`https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`}
                          alt=""
                          width={128}
                          height={72}
                          className="h-[72px] w-32 shrink-0 rounded-[var(--radius-sm)] object-cover"
                        />
                        <div className="min-w-0">
                          <Link
                            href={`https://www.youtube.com/watch?v=${video.videoId}`}
                            target="_blank"
                            className="line-clamp-2 text-sm font-medium text-[color:var(--color-text-primary)] hover:text-[color:var(--color-accent)] hover:underline"
                          >
                            {video.title}
                          </Link>
                          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">{video.channelTitle}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[color:var(--color-text-primary)]">
                      {formatDuration(video.durationSeconds)}
                    </td>
                    <td className="px-4 py-3 text-right">{formatNumber(video.viewCount)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(video.subscriberCount)}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex min-w-14 justify-center rounded-full px-2.5 py-1 font-semibold ${
                        (video.performanceRatio ?? 0) >= 1
                          ? 'bg-[color:var(--color-accent-soft)] text-[color:var(--color-accent)]'
                          : 'bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-secondary)]'
                      }`}>
                        {video.performanceRatio === null ? '–' : `${decimalFormatter.format(video.performanceRatio)}倍`}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">{video.viewVelocity ? `${formatNumber(Math.round(video.viewVelocity))}回` : '–'}</td>
                    <td className="px-4 py-3 text-right text-[color:var(--color-text-secondary)]">
                      {video.publishedAt ? dateFormatter.format(new Date(video.publishedAt)) : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <div className="p-6">
            <EmptyState
              title="条件に合う動画がありません"
              description={categoryVideos.length ? 'フィルターを切り替えると取得済み動画を確認できます。' : '競合を登録して同期すると動画が表示されます。'}
            />
          </div>
        )}
      </Card>

      <Card className="p-0">
        <div className="border-b border-[color:var(--color-border)] px-5 py-5 sm:px-6">
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">登録チャンネル</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
            追加・停止はこのチャットから行い、登録後は日次でデータを更新します。
          </p>
        </div>
        {categoryCompetitors.length ? (
          <div className="overflow-x-auto">
            <Table className="min-w-[860px] rounded-none text-xs">
              <thead className="bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3 text-left">チャンネル</th>
                  <th className="px-4 py-3 text-right">登録者</th>
                  <th className="px-4 py-3 text-right">総再生数</th>
                  <th className="px-4 py-3 text-right">動画数</th>
                  <th className="px-4 py-3 text-right">平均伸び速度</th>
                  <th className="px-4 py-3 text-left">最新動画</th>
                </tr>
              </thead>
              <tbody>
                {categoryCompetitors.map((competitor) => (
                  <tr key={competitor.channelId} className="hover:bg-[color:var(--color-surface-muted)]">
                    <td className="px-4 py-3">
                      <Link
                        href={`https://www.youtube.com/channel/${competitor.channelId}`}
                        target="_blank"
                        className="text-sm font-medium text-[color:var(--color-text-primary)] hover:text-[color:var(--color-accent)] hover:underline"
                      >
                        {competitor.channelTitle}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">{formatNumber(competitor.subscriberCount)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(competitor.viewCount)}</td>
                    <td className="px-4 py-3 text-right">{formatNumber(competitor.videoCount)}</td>
                    <td className="px-4 py-3 text-right">
                      {competitor.avgViewVelocity ? `${formatNumber(Math.round(competitor.avgViewVelocity))}回/日` : '–'}
                    </td>
                    <td className="max-w-[320px] px-4 py-3">
                      <p className="line-clamp-2 text-sm text-[color:var(--color-text-primary)]">{competitor.latestVideoTitle ?? '–'}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <div className="p-6">
            <EmptyState title="登録チャンネルがありません" description="このチャットで追加したいチャンネルを指定してください。" />
          </div>
        )}
      </Card>
    </div>
  );
}
