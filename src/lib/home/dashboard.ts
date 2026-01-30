import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { getThreadsInsightsData } from '@/lib/threadsInsightsData';
import { getThreadsDashboard } from '@/lib/threadsDashboard';
import { getInstagramDashboardData } from '@/lib/instagram/dashboard';
import { getYoutubeDashboardData } from '@/lib/youtube/dashboard';
import {
  createYoutubeBigQueryContext,
  ensureYoutubeTables,
  listContentScripts,
  type StoredContentScript,
} from '@/lib/youtube/bigquery';
import { getLineDashboardData } from '@/lib/lstep/dashboard';
import { getLstepAnalyticsByDateRange, countLineRegistrationsByDateRange, countLineRegistrationsBySource } from '@/lib/lstep/analytics';
import { getLinkClicksSummary } from '@/lib/links/analytics';
import { formatDateInput } from '@/lib/dateRangePresets';
import type { YoutubeVideoSummary } from '@/lib/youtube/dashboard';
import type { ReelHighlight } from '@/lib/instagram/dashboard';
import type { PostInsight } from '@/lib/threadsInsightsData';

const PROJECT_ID = resolveProjectId();
const DEFAULT_RANGE_DAYS = 7;

export interface HomeFollowerBreakdown {
  platform: 'threads' | 'instagram' | 'youtube' | 'line';
  label: string;
  count: number;
  delta?: number | null;
}

export interface HomeTaskItem {
  platform: 'threads' | 'instagram' | 'youtube' | 'line' | 'ads';
  title: string;
  value: string;
  description?: string;
  href?: string;
}

export interface HomeHighlight {
  platform: 'threads' | 'instagram' | 'youtube';
  title: string;
  metricLabel: string;
  metricValue: string;
  summary: string;
  mediaUrl?: string | null;
  permalink?: string | null;
}

export interface HomePlatformSummary {
  key: 'threads' | 'instagram' | 'youtube';
  title: string;
  metrics: Array<{
    label: string;
    value: string;
    helper?: string | null;
  }>;
}

export interface HomeDashboardData {
  period: {
    start: string;
    end: string;
  };
  selectedRange: string;
  followerBreakdown: HomeFollowerBreakdown[];
  totalFollowers: number;
  highlights: HomeHighlight[];
  tasks: HomeTaskItem[];
  lineFunnel: Array<{ stage: string; users: number }>;
  lineRegistrationBySource: Array<{ source: string; registrations: number }>;
  clickSummary: {
    total: number;
    breakdown: string | null;
  };
  storedScripts: StoredContentScript[];
  youtubeTopVideo?: YoutubeVideoSummary;
  instagramTopReel?: ReelHighlight;
  threadsTopPost?: PostInsight;
  platformSummaries: HomePlatformSummary[];
}

const toDateKey = (date: Date): string => formatDateInput(date);

function formatNumberIntl(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value);
}
async function fetchLineAudienceTotal(projectId: string): Promise<number | null> {
  try {
    const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);
    const datasetId = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';
    const [rows] = await client.query({
      query: `
        WITH latest AS (
          SELECT MAX(snapshot_date) AS snapshot_date FROM \`${projectId}.${datasetId}.user_core\`
        )
        SELECT COUNT(DISTINCT user_id) AS total_users
        FROM \`${projectId}.${datasetId}.user_core\`
        WHERE snapshot_date = (SELECT snapshot_date FROM latest)
      `,
    });
    const typedRows = rows as Array<{ total_users: number | null }>;
    const total = Number(typedRows?.[0]?.total_users ?? 0);
    return Number.isFinite(total) ? total : null;
  } catch (error) {
    console.warn('[home/dashboard] Failed to load LINE audience total', error);
    return null;
  }
}

function findValueOnOrBefore<T extends { date: string }>(
  series: T[],
  targetDate: string,
  getValue: (item: T) => number,
): number | null {
  for (const item of series) {
    if (item.date <= targetDate) {
      const value = getValue(item);
      if (Number.isFinite(value)) {
        return value;
      }
    }
  }
  return null;
}

function sumValuesWithinRange<T extends { date: string }>(
  series: T[],
  startDate: string,
  endDate: string,
  getValue: (item: T) => number,
): number {
  return series
    .filter((item) => item.date >= startDate && item.date <= endDate)
    .reduce((sum, item) => sum + (getValue(item) || 0), 0);
}

export async function getHomeDashboardData(options: {
  rangeDays?: number;
  rangeValue?: string;
  startDate?: Date;
  endDate?: Date;
} = {}): Promise<HomeDashboardData> {
  const rangeDays = options.rangeDays ?? DEFAULT_RANGE_DAYS;
  const selectedRangeValue = options.rangeValue ?? `${rangeDays}d`;
  // resolveDateRangeで計算された日付をそのまま使用（タイムゾーン維持）
  let periodEnd = options.endDate ?? new Date();
  let periodStart = options.startDate ?? (() => {
    const start = new Date(periodEnd.getTime());
    start.setDate(start.getDate() - rangeDays + 1);
    return start;
  })();

  // LINEタブと同様に、最新スナップショット日付に基づいて期間を調整
  // 今日のJST日付を使用（LステップCSVは今日分まで取得済みのため）
  // 日付比較のために時間を正規化（startOfDayで比較）
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const periodEndDate = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), periodEnd.getDate(), 0, 0, 0, 0);

  if (periodEndDate.getTime() < todayStart.getTime()) {
    // 期間を今日まで延長（LINEタブのadjustRangeWithSnapshotと同じロジック）
    // durationDaysは元の期間と同じ日数を維持（resolveDateRangeで「昨日」が終了日なので+1して今日を終了日に）
    periodEnd = new Date(todayStart.getFullYear(), todayStart.getMonth(), todayStart.getDate(), 23, 59, 59, 999);
    // startDateも1日ずらす（終了日を1日延長したので開始日も1日延長）
    periodStart = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);
    periodStart = new Date(periodStart.getFullYear(), periodStart.getMonth(), periodStart.getDate(), 0, 0, 0, 0);
  }

  const [
    threadsInsights,
    threadsDashboard,
    instagramData,
    youtubeData,
    lineData,
    lineAudienceTotal,
    linkSummary,
    lineAnalytics,
    lineRegistrationCount,
  ] = await Promise.all([
    getThreadsInsightsData(),
    getThreadsDashboard(),
    getInstagramDashboardData(PROJECT_ID),
    getYoutubeDashboardData(),
    getLineDashboardData(PROJECT_ID),
    fetchLineAudienceTotal(PROJECT_ID),
    getLinkClicksSummary({ startDate: periodStart, endDate: periodEnd }),
    getLstepAnalyticsByDateRange(PROJECT_ID, toDateKey(periodStart), toDateKey(periodEnd)),
    countLineRegistrationsByDateRange(PROJECT_ID, toDateKey(periodStart), toDateKey(periodEnd)),
  ]);

  const youtubeContext = createYoutubeBigQueryContext(PROJECT_ID, process.env.YOUTUBE_BQ_DATASET_ID ?? 'autostudio_media');
  await ensureYoutubeTables(youtubeContext);
  const storedScripts = await listContentScripts(youtubeContext, { limit: 6 });

  const periodStartKey = toDateKey(periodStart);
  const periodEndKey = toDateKey(periodEnd);

  const threadsFollowerLatest = threadsInsights.dailyMetrics[0]?.followers ?? 0;
  const threadsFollowerStart = findValueOnOrBefore(threadsInsights.dailyMetrics, periodStartKey, (item) => item.followers) ?? threadsFollowerLatest;
  const threadsFollowerDelta = threadsFollowerLatest - threadsFollowerStart;

  const instagramFollowerLatest = instagramData.latestFollower?.followers ?? instagramData.followerSeries[0]?.followers ?? 0;
  const instagramFollowerStart = findValueOnOrBefore(instagramData.followerSeries, periodStartKey, (item) => item.followers) ?? instagramFollowerLatest;
  const instagramFollowerDelta = instagramFollowerLatest - instagramFollowerStart;

  const youtubeSubscriberLatest = youtubeData.channelSummary?.subscriberCount ?? 0;
  const youtubeSubscriberDelta = sumValuesWithinRange(youtubeData.overviewSeries, periodStartKey, periodEndKey, (point) => Number(point.subscriberNet ?? 0));

  const linkClicksByCategory = new Map(linkSummary.byCategory.map((item) => [item.category, item.clicks]));
  const topClicksDescription = ['threads', 'instagram', 'youtube']
    .map((category) => {
      const clicks = linkClicksByCategory.get(category);
      if (!clicks) return null;
      return `${category}: ${formatNumberIntl(clicks)}`;
    })
    .filter((value): value is string => Boolean(value))
    .join(' / ');

  const clickSummary = {
    total: linkSummary.total,
    breakdown: topClicksDescription || null,
  };

  const threadsHighlightPost = threadsInsights.posts[0];
  const instagramHighlightReel = instagramData.reels[0];
  const youtubeHighlightVideo = youtubeData.topVideos[0];

  const highlights: HomeHighlight[] = [];
  if (threadsHighlightPost) {
    highlights.push({
      platform: 'threads',
      title: threadsHighlightPost.mainText.slice(0, 64) || 'スレッド投稿',
      metricLabel: 'いいね',
      metricValue: formatNumberIntl(threadsHighlightPost.insights.likes ?? 0),
      summary: `投稿日時: ${new Date(threadsHighlightPost.postedAt).toLocaleString('ja-JP')}`,
    });
  }
  if (instagramHighlightReel) {
    highlights.push({
      platform: 'instagram',
      title: instagramHighlightReel.caption ?? 'Reelハイライト',
      metricLabel: '再生数',
      metricValue: formatNumberIntl(instagramHighlightReel.views ?? 0),
      summary: `リーチ: ${formatNumberIntl(instagramHighlightReel.reach ?? 0)} / 保存: ${formatNumberIntl(instagramHighlightReel.saved ?? 0)}`,
      mediaUrl: instagramHighlightReel.thumbnailUrl ?? instagramHighlightReel.driveImageUrl ?? null,
      permalink: instagramHighlightReel.permalink ?? undefined,
    });
  }
  if (youtubeHighlightVideo) {
    highlights.push({
      platform: 'youtube',
      title: youtubeHighlightVideo.title,
      metricLabel: '視聴回数',
      metricValue: formatNumberIntl(youtubeHighlightVideo.viewCount ?? 0),
      summary: youtubeHighlightVideo.publishedAt
        ? `公開日: ${new Date(youtubeHighlightVideo.publishedAt).toLocaleDateString('ja-JP')}`
        : '公開日情報なし',
      mediaUrl: youtubeHighlightVideo.videoId ? `https://i.ytimg.com/vi/${youtubeHighlightVideo.videoId}/hqdefault.jpg` : undefined,
    });
  }

  const tasks: HomeTaskItem[] = [
    {
      platform: 'threads',
      title: '本日の投稿数',
      value: `${threadsDashboard.jobCounts.succeededToday} 件`,
      description: '自動投稿ジョブの成功数',
      href: '/threads',
    },
    {
      platform: 'youtube',
      title: '台本ドラフト',
      value: `${storedScripts.length} 件`,
      description: 'Notionに保存された最新台本',
      href: '/youtube',
    },
    {
      platform: 'line',
      title: '本日の友だち追加',
      value: `${formatNumberIntl(lineData.dailyNewFriends.at(-1)?.count ?? 0)} 人`,
      description: '最新の日別登録数',
      href: '/line',
    },
    {
      platform: 'ads',
      title: '広告タブ',
      value: '準備中',
      description: 'CPA・消化金額は今後追加予定',
      href: '/ads',
    },
  ];

  const lineSourceCounts = await countLineRegistrationsBySource(
    PROJECT_ID,
    toDateKey(periodStart),
    toDateKey(periodEnd),
  );

  const lineRegistrationBySource = [
    { source: 'Threads', registrations: lineSourceCounts.threads },
    { source: 'Instagram', registrations: lineSourceCounts.instagram },
    { source: 'YouTube', registrations: lineSourceCounts.youtube },
    { source: 'その他', registrations: lineSourceCounts.other },
    { source: 'オーガニック', registrations: lineSourceCounts.organic },
  ];

  const lineFollowerLatest = lineAudienceTotal ?? 0;
  // KPIカードのdeltaはLINEタブと同じlstep_friends_rawテーブルから取得
  const lineRegistrationPeriodTotal = lineRegistrationCount;

  const followerBreakdown: HomeFollowerBreakdown[] = [
    {
      platform: 'threads',
      label: 'Threads',
      count: threadsFollowerLatest,
      delta: threadsFollowerDelta,
    },
    {
      platform: 'instagram',
      label: 'Instagram',
      count: instagramFollowerLatest,
      delta: instagramFollowerDelta,
    },
    {
      platform: 'youtube',
      label: 'YouTube',
      count: youtubeSubscriberLatest ?? 0,
      delta: youtubeSubscriberDelta,
    },
    {
      platform: 'line',
      label: 'LINE',
      count: lineFollowerLatest ?? 0,
      delta: lineRegistrationPeriodTotal,
    },
  ];

  const totalFollowers = followerBreakdown.reduce((sum, item) => sum + (item.count ?? 0), 0);

  const lineRegistrationMap = new Map(lineRegistrationBySource.map((item) => [item.source, item.registrations]));

  const threadsImpressionsTotal = threadsInsights.posts.reduce<number>((sum, post) => {
    const impressions = Number(post.insights?.impressions ?? 0);
    return sum + (Number.isFinite(impressions) ? impressions : 0);
  }, 0);

  const threadsLinkClicks = linkClicksByCategory.get('threads') ?? 0;
  const threadsLineRegistrations = lineRegistrationMap.get('Threads') ?? 0;

  const instagramLatestReach = instagramData.latestFollower?.reach ?? 0;
  const instagramLinkClicks = linkClicksByCategory.get('instagram') ?? 0;
  const instagramLineRegistrations = lineRegistrationMap.get('Instagram') ?? 0;

  const youtubeTotalSubscribers = youtubeSubscriberLatest ?? 0;
  const youtubeViewsInRange = sumValuesWithinRange(youtubeData.overviewSeries, periodStartKey, periodEndKey, (point) => Number(point.views ?? 0));
  const youtubeLinkClicks = linkClicksByCategory.get('youtube');
  const youtubeLineRegistrations = lineRegistrationMap.get('YouTube') ?? (youtubeData.lineRegistrationCount ?? 0);

  const platformSummaries: HomePlatformSummary[] = [
    {
      key: 'threads',
      title: 'Threads',
      metrics: [
        { label: 'フォロワー', value: `${formatNumberIntl(threadsFollowerLatest)} 人` },
        { label: 'インプレッション', value: `${formatNumberIntl(threadsImpressionsTotal)} 回` },
        { label: 'リンククリック', value: `${formatNumberIntl(threadsLinkClicks)} 件` },
        { label: 'LINE登録', value: `${formatNumberIntl(threadsLineRegistrations)} 人` },
      ],
    },
    {
      key: 'instagram',
      title: 'Instagram',
      metrics: [
        { label: 'フォロワー', value: `${formatNumberIntl(instagramFollowerLatest)} 人` },
        { label: 'リーチ', value: `${formatNumberIntl(instagramLatestReach)} 件` },
        { label: 'リンククリック', value: `${formatNumberIntl(instagramLinkClicks)} 件` },
        { label: 'LINE登録', value: `${formatNumberIntl(instagramLineRegistrations)} 人` },
      ],
    },
    {
      key: 'youtube',
      title: 'YouTube',
      metrics: [
        { label: '登録者', value: `${formatNumberIntl(youtubeTotalSubscribers)} 人` },
        { label: '再生回数', value: `${formatNumberIntl(Math.round(youtubeViewsInRange))} 回` },
        { label: 'リンククリック', value: '〇', helper: youtubeLinkClicks ? `既存クリック ${formatNumberIntl(youtubeLinkClicks)} 件` : 'データ取得準備中' },
        { label: 'LINE登録', value: `${formatNumberIntl(youtubeLineRegistrations)} 人` },
      ],
    },
  ];

  return {
    period: {
      start: toDateKey(periodStart),
      end: toDateKey(periodEnd),
    },
    selectedRange: selectedRangeValue,
    followerBreakdown,
    totalFollowers,
    highlights,
    tasks,
    lineFunnel: lineData.funnel,
    lineRegistrationBySource,
    clickSummary,
    storedScripts,
    youtubeTopVideo: youtubeHighlightVideo,
    instagramTopReel: instagramHighlightReel,
    threadsTopPost: threadsHighlightPost,
    platformSummaries,
  };
}
