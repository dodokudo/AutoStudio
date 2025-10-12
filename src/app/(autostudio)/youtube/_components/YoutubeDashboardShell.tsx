'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Table } from '@/components/ui/table';
import { ScriptGenerateButton } from '@/components/youtube/ScriptGenerateButton';
import type {
  YoutubeDashboardData,
  YoutubeOverviewSeriesPoint,
  YoutubeVideoSummary,
} from '@/lib/youtube/dashboard';
import type { StoredContentScript } from '@/lib/youtube/bigquery';
import { YoutubeViewTrendChart } from './YoutubeViewTrendChart';

type TabKey = 'scripts' | 'own' | 'competitors';

interface YoutubeDashboardShellProps {
  overview: YoutubeDashboardData['overview'];
  overviewSeries: YoutubeOverviewSeriesPoint[];
  analytics: YoutubeDashboardData['analytics'];
  topVideos: YoutubeVideoSummary[];
  competitors: YoutubeDashboardData['competitors'];
  scripts: StoredContentScript[];
  lineRegistrationCount: number | null;
}

const TABS: { id: TabKey; label: string }[] = [
  { id: 'scripts', label: '台本作成' },
  { id: 'own', label: '自社データ' },
  { id: 'competitors', label: '競合データ' },
];

const numberFormatter = new Intl.NumberFormat('ja-JP');
const percentFormatter = new Intl.NumberFormat('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  return numberFormatter.format(value);
}

function formatDurationSeconds(value: number | null | undefined) {
  if (!value || value <= 0) return '–';
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}分${seconds.toString().padStart(2, '0')}秒`;
}

function formatPercent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return '–';
  return `${percentFormatter.format(value * 100)}%`;
}

function formatPublishedAt(value?: string) {
  if (!value) return '–';
  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return value;
  }
}

function youtubeThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function YoutubeDashboardShell({
  overview,
  overviewSeries,
  analytics,
  topVideos,
  competitors,
  scripts,
  lineRegistrationCount,
}: YoutubeDashboardShellProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('own');
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(topVideos[0]?.videoId ?? null);

  useEffect(() => {
    if (topVideos.length === 0) {
      setSelectedVideoId(null);
      return;
    }
    setSelectedVideoId((current) => current ?? topVideos[0]?.videoId ?? null);
  }, [topVideos]);

  const selectedVideo = selectedVideoId ? topVideos.find((video) => video.videoId === selectedVideoId) : undefined;

  const seriesForChart = useMemo(() => {
    const sorted = [...overviewSeries]
      .filter((point) => Boolean(point.date))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    return sorted.slice(-35).map((point) => ({
      date: point.date,
      views: point.views,
    }));
  }, [overviewSeries]);

  const summaryCards = useMemo(() => {
    const lineRate =
      typeof lineRegistrationCount === 'number' && lineRegistrationCount > 0 && overview.totalViews30d > 0
        ? `${percentFormatter.format((lineRegistrationCount / overview.totalViews30d) * 100)}%`
        : null;

    return [
      {
        label: '直近30日視聴回数',
        primary: `${formatNumber(Math.round(overview.totalViews30d))} 回`,
        secondary: null,
      },
      {
        label: '平均視聴時間',
        primary: formatDurationSeconds(Math.round(overview.avgViewDuration)),
        secondary: '1視聴あたり',
      },
      {
        label: '登録者純増 (30日)',
        primary: `${overview.subscriberDelta30d >= 0 ? '+' : ''}${formatNumber(Math.round(overview.subscriberDelta30d))} 人`,
        secondary: null,
      },
      {
        label: 'LINE登録数',
        primary: lineRegistrationCount !== null ? `${formatNumber(lineRegistrationCount)} 人` : '–',
        secondary: lineRate ? `遷移率 ${lineRate}` : null,
      },
    ];
  }, [overview, lineRegistrationCount]);

  const ownTabContent = (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[color:var(--color-text-primary)]">YouTube チャンネルアナリティクス</h1>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          運用中のチャンネル指標をYouTube Studioライクなレイアウトで把握できます。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <Card key={card.label} className="p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">
              {card.label}
            </p>
            <p className="mt-3 text-xl font-semibold text-[color:var(--color-text-primary)]">{card.primary}</p>
            {card.secondary ? (
              <p className="mt-2 text-xs text-[color:var(--color-text-secondary)]">{card.secondary}</p>
            ) : null}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[2.2fr_1fr]">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">過去28日間</p>
              <h2 className="mt-2 text-lg font-semibold text-[color:var(--color-text-primary)]">チャンネル視聴回数</h2>
              <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
                過去4週間の推移です。ピーク日をホバーして詳細を確認できます。
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-[color:var(--color-text-muted)]">合計視聴回数</p>
              <p className="text-xl font-semibold text-[color:var(--color-text-primary)]">
                {formatNumber(Math.round(overview.totalViews30d))}
              </p>
            </div>
          </div>
          <div className="mt-6">
            {seriesForChart.length ? (
              <YoutubeViewTrendChart data={seriesForChart} />
            ) : (
              <div className="flex h-64 items-center justify-center">
                <p className="text-sm text-[color:var(--color-text-muted)]">表示可能な時系列データがありません。</p>
              </div>
            )}
          </div>
        </Card>

        <div className="grid gap-4">
          <Card className="p-6">
            <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">直近のハイライト</h3>
            <ul className="mt-4 space-y-3 text-sm text-[color:var(--color-text-secondary)]">
              <li>
                最新スナップショット: {overview.latestSnapshotDate ? dateTimeFormatter.format(new Date(overview.latestSnapshotDate)) : '–'}
              </li>
              <li>平均視聴時間: {formatDurationSeconds(Math.round(overview.avgViewDuration))}</li>
              <li>
                登録者純増: {overview.subscriberDelta30d >= 0 ? '+' : ''}
                {formatNumber(Math.round(overview.subscriberDelta30d))}人
              </li>
              <li>LINE登録数: {lineRegistrationCount !== null ? `${formatNumber(lineRegistrationCount)}人` : '–'}</li>
            </ul>
          </Card>

          <Card className="p-6">
            <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">リアルタイムサマリー</h3>
            <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
              直近48時間の詳細データ連携を準備中です。現在は最新集計値を表示しています。
            </p>
            <div className="mt-4 space-y-2 text-sm">
              <p className="flex items-center justify-between">
                <span className="text-[color:var(--color-text-muted)]">視聴回数 (30日)</span>
                <span className="font-medium text-[color:var(--color-text-primary)]">
                  {formatNumber(Math.round(overview.totalViews30d))}
                </span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-[color:var(--color-text-muted)]">視聴時間 (分)</span>
                <span className="font-medium text-[color:var(--color-text-primary)]">
                  {formatNumber(Math.round(analytics.own.last30Days.watchTimeMinutes))}
                </span>
              </p>
              <p className="flex items-center justify-between">
                <span className="text-[color:var(--color-text-muted)]">直近7日登録者</span>
                <span className="font-medium text-[color:var(--color-text-primary)]">
                  {analytics.own.last7Days.subscriberNet >= 0 ? '+' : ''}
                  {formatNumber(analytics.own.last7Days.subscriberNet)}人
                </span>
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">この期間の上位コンテンツ</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
              視聴数・伸び率をもとに並び替えた上位動画です。
            </p>
          </div>
          <Link href="https://studio.youtube.com/" target="_blank" className="text-sm text-[color:var(--color-accent)] hover:underline">
            YouTube Studioで開く
          </Link>
        </div>
        {topVideos.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {topVideos.slice(0, 6).map((video) => (
              <button
                key={video.videoId}
                type="button"
                onClick={() => setSelectedVideoId(video.videoId)}
                className="group relative overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border)] text-left transition hover:border-[color:var(--color-accent)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]"
              >
                <div className="aspect-video overflow-hidden bg-black">
                  <Image
                    src={youtubeThumbnailUrl(video.videoId)}
                    alt={video.title}
                    width={480}
                    height={270}
                    className="h-full w-full object-cover transition duration-200 group-hover:scale-105"
                  />
                </div>
                <div className="p-3">
                  <p className="line-clamp-2 text-sm font-medium text-[color:var(--color-text-primary)]">{video.title}</p>
                  <div className="mt-2 flex items-center justify-between text-xs text-[color:var(--color-text-muted)]">
                    <span>{formatNumber(video.viewCount ?? 0)} 回視聴</span>
                    <span>{formatPublishedAt(video.publishedAt)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState title="データがありません" description="動画データが取り込まれるとここに表示されます。" />
          </div>
        )}
      </Card>

      <Card className="p-0">
        <div className="border-b border-[color:var(--color-border)] px-6 py-4">
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">動画別パフォーマンス</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
            LINE登録数を含めた粒度で分析できます。各行を選択すると詳細が表示されます。
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table className="rounded-none">
            <thead>
              <tr className="bg-[color:var(--color-surface-muted)] text-xs text-[color:var(--color-text-muted)]">
                <th className="px-4 py-3">コンテンツ</th>
                <th className="px-4 py-3">視聴回数</th>
                <th className="px-4 py-3">伸び速度</th>
                <th className="px-4 py-3">エンゲージメント</th>
                <th className="px-4 py-3">LINE登録</th>
              </tr>
            </thead>
            <tbody>
              {topVideos.map((video) => {
                const isActive = selectedVideoId === video.videoId;
                return (
                  <tr
                    key={video.videoId}
                    className={`cursor-pointer transition ${isActive ? 'bg-[color:var(--color-surface-muted)]' : 'hover:bg-[color:var(--color-surface-muted)]'}`}
                    onClick={() => setSelectedVideoId(video.videoId)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="h-12 w-20 overflow-hidden rounded bg-black">
                          <Image
                            src={youtubeThumbnailUrl(video.videoId)}
                            alt={video.title}
                            width={160}
                            height={90}
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-[color:var(--color-text-primary)]">{video.title || '(タイトル未設定)'}</p>
                          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">公開日: {formatPublishedAt(video.publishedAt)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-[color:var(--color-text-primary)]">
                      {formatNumber(video.viewCount ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-sm">{video.viewVelocity ? `${formatNumber(Math.round(video.viewVelocity))} /日` : '–'}</td>
                    <td className="px-4 py-3 text-sm">{video.engagementRate !== undefined ? formatPercent(video.engagementRate) : '–'}</td>
                    <td className="px-4 py-3 text-sm text-[color:var(--color-text-muted)]">–</td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
        {selectedVideo ? (
          <div className="border-t border-[color:var(--color-border)] p-6">
            <div className="flex flex-wrap gap-6">
              <div className="w-full max-w-sm">
                <div className="overflow-hidden rounded-[var(--radius-md)] bg-black">
                  <Image
                    src={youtubeThumbnailUrl(selectedVideo.videoId)}
                    alt={selectedVideo.title}
                    width={640}
                    height={360}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
              <div className="flex-1 min-w-[220px] space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-[color:var(--color-text-primary)]">{selectedVideo.title || '(タイトル未設定)'}</h3>
                  <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">公開日: {formatPublishedAt(selectedVideo.publishedAt)}</p>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <MetricChip label="視聴回数" value={`${formatNumber(selectedVideo.viewCount ?? 0)} 回`} />
                  <MetricChip label="いいね" value={formatNumber(selectedVideo.likeCount ?? 0)} />
                  <MetricChip label="コメント" value={formatNumber(selectedVideo.commentCount ?? 0)} />
                  <MetricChip label="日次伸び速度" value={selectedVideo.viewVelocity ? `${formatNumber(Math.round(selectedVideo.viewVelocity))} /日` : '–'} />
                  <MetricChip label="平均エンゲージメント" value={selectedVideo.engagementRate !== undefined ? formatPercent(selectedVideo.engagementRate) : '–'} />
                  <MetricChip label="LINE登録" value="–" muted />
                </div>
                <div className="flex gap-3">
                  <Link
                    href={`https://www.youtube.com/watch?v=${selectedVideo.videoId}`}
                    target="_blank"
                    className="text-sm text-[color:var(--color-accent)] hover:underline"
                  >
                    YouTubeで動画を開く
                  </Link>
                  <Link
                    href={`https://studio.youtube.com/video/${selectedVideo.videoId}/analytics/tab-overview/period-default`}
                    target="_blank"
                    className="text-sm text-[color:var(--color-accent)] hover:underline"
                  >
                    YouTube Studioで詳細を見る
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );

  const scriptTabContent = (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">台本作成ワークスペース</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
              最新のYouTube分析結果をもとに、AIがドラフト台本を生成します。Notionの台本DBと連携しています。
            </p>
          </div>
          <ScriptGenerateButton themeKeyword="YouTube動画" />
        </div>
        {scripts.length ? (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {scripts.map((script) => (
              <Card key={script.notionPageId ?? script.contentId} className="accent-gradient p-4">
                <p className="text-xs font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">
                  {script.status ?? 'Draft'}
                </p>
                <h3 className="mt-2 text-base font-semibold text-[color:var(--color-text-primary)]">
                  {script.title || 'Untitled Script'}
                </h3>
                <p className="mt-3 line-clamp-4 text-sm text-[color:var(--color-text-secondary)]">
                  {script.summary || '概要はまだありません。'}
                </p>
                {script.notionPageId ? (
                  <Link
                    href={`https://www.notion.so/${script.notionPageId.replace(/-/g, '')}`}
                    target="_blank"
                    className="mt-3 inline-flex text-xs font-medium text-[color:var(--color-accent)] hover:underline"
                  >
                    Notionで開く
                  </Link>
                ) : null}
              </Card>
            ))}
          </div>
        ) : (
          <div className="mt-6">
            <EmptyState
              title="台本がまだありません"
              description="台本生成を実行すると最新案がここに表示されます。"
            />
          </div>
        )}
      </Card>
    </div>
  );

  const competitorTabContent = (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[color:var(--color-text-primary)]">競合チャンネル分析</h1>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          監視対象のチャンネル推移と最新動画パフォーマンスを追跡できます。
        </p>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">チャンネル概要</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          登録者・再生回数・平均伸び速度など主要指標のスナップショットです。
        </p>
        {competitors.length ? (
          <div className="mt-4 overflow-x-auto">
            <Table className="rounded-none text-xs">
              <thead className="bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-muted)]">
                <tr>
                  <th className="px-4 py-3 text-left">チャンネル</th>
                  <th className="px-4 py-3 text-left">登録者</th>
                  <th className="px-4 py-3 text-left">総再生数</th>
                  <th className="px-4 py-3 text-left">動画数</th>
                  <th className="px-4 py-3 text-left">平均伸び速度</th>
                  <th className="px-4 py-3 text-left">平均ER</th>
                  <th className="px-4 py-3 text-left">最新動画</th>
                  <th className="px-4 py-3 text-left">投稿日</th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((competitor) => (
                  <tr key={competitor.channelId} className="hover:bg-[color:var(--color-surface-muted)]">
                    <td className="px-4 py-3 text-sm font-medium text-[color:var(--color-text-primary)]">{competitor.channelTitle}</td>
                    <td className="px-4 py-3">{competitor.subscriberCount ? `${formatNumber(competitor.subscriberCount)} 人` : '–'}</td>
                    <td className="px-4 py-3">{competitor.viewCount ? `${formatNumber(competitor.viewCount)} 回` : '–'}</td>
                    <td className="px-4 py-3">{competitor.videoCount ? `${formatNumber(competitor.videoCount)} 本` : '–'}</td>
                    <td className="px-4 py-3">
                      {competitor.avgViewVelocity ? `${formatNumber(Math.round(competitor.avgViewVelocity))} /日` : '–'}
                    </td>
                    <td className="px-4 py-3">
                      {competitor.avgEngagementRate !== null && competitor.avgEngagementRate !== undefined
                        ? formatPercent(competitor.avgEngagementRate)
                        : '–'}
                    </td>
                    <td className="px-4 py-3">
                      {competitor.latestVideoTitle ? (
                        <div className="flex flex-col gap-1">
                          <span className="text-sm text-[color:var(--color-text-primary)]">{competitor.latestVideoTitle}</span>
                          <span className="text-xs text-[color:var(--color-text-muted)]">
                            {competitor.latestVideoViewCount ? `${formatNumber(competitor.latestVideoViewCount)} 回` : '–'}
                          </span>
                        </div>
                      ) : (
                        '–'
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[color:var(--color-text-secondary)]">
                      {competitor.latestVideoPublishedAt ? dateTimeFormatter.format(new Date(competitor.latestVideoPublishedAt)) : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        ) : (
          <div className="mt-4">
            <EmptyState title="データがありません" description="競合チャンネルの統計が取り込まれると表示されます。" />
          </div>
        )}
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'primary' : 'secondary'}
            onClick={() => setActiveTab(tab.id)}
            className="px-5"
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === 'own' ? ownTabContent : null}
      {activeTab === 'scripts' ? scriptTabContent : null}
      {activeTab === 'competitors' ? competitorTabContent : null}
    </div>
  );
}

interface MetricChipProps {
  label: string;
  value: string;
  muted?: boolean;
}

function MetricChip({ label, value, muted }: MetricChipProps) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${muted ? 'text-[color:var(--color-text-muted)]' : 'text-[color:var(--color-text-primary)]'}`}>
        {value}
      </p>
    </div>
  );
}
