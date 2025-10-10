import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { countLineSourceRegistrations } from '@/lib/lstep/dashboard';

export interface YoutubeOverview {
  totalViews30d: number;
  avgViewDuration: number;
  subscriberDelta30d: number;
  latestSnapshotDate: string | null;
}

export interface YoutubeVideoSummary {
  videoId: string;
  title: string;
  channelId: string;
  channelTitle?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  viewVelocity?: number;
  engagementRate?: number;
  publishedAt?: string;
  tags?: string[];
}

export interface YoutubeThemeSuggestion {
  keyword: string;
  score: number;
  representativeVideos: YoutubeVideoSummary[];
}

export interface YoutubeDashboardData {
  overview: YoutubeOverview;
  topVideos: YoutubeVideoSummary[];
  themes: YoutubeThemeSuggestion[];
  analytics: {
    own: {
      last30Days: AnalyticsSummary;
      last7Days: AnalyticsSummary;
    };
    comparison: ComparisonSummary | null;
  };
  competitors: YoutubeCompetitorSummary[];
  lineRegistrationCount: number | null;
}

interface AnalyticsSummary {
  views: number;
  watchTimeMinutes: number;
  averageViewDurationSeconds: number;
  subscriberNet: number;
}

interface ComparisonSummary {
  ownViewVelocity: number | null;
  competitorViewVelocity: number | null;
  ownEngagementRate: number | null;
  competitorEngagementRate: number | null;
}

interface YoutubeCompetitorSummary {
  channelId: string;
  channelTitle: string;
  subscriberCount?: number;
  viewCount?: number;
  videoCount?: number;
  avgViewVelocity?: number | null;
  avgEngagementRate?: number | null;
  latestVideoTitle?: string;
  latestVideoViewCount?: number | null;
  latestVideoPublishedAt?: string;
}

const STOPWORDS = new Set([
  'the',
  'and',
  'with',
  'for',
  'from',
  'about',
  'this',
  'that',
  'what',
  'how',
  'to',
  'ai',
  'use',
  'using',
  '最新',
  '完全',
  '紹介',
  '速報',
  '活用',
  'まとめ',
  '講座',
  '徹底',
  '解説',
  '無料',
  '保存版',
]);

function sanitizeKeyword(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (STOPWORDS.has(trimmed)) return null;
  if (/^\d+$/.test(trimmed)) return null;
  if (trimmed.length < 2) return null;
  return trimmed;
}

function extractKeywords(video: YoutubeVideoSummary): string[] {
  const keywords = new Set<string>();
  const candidates = [video.title ?? '', ...(video.tags ?? []).join(',').split(','), video.channelTitle ?? ''];

  for (const chunk of candidates) {
    const parts = chunk
      .split(/[\s、。,\/\-|#・\[\]\(\)【】]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    for (const part of parts) {
      const normalized = sanitizeKeyword(part);
      if (normalized) {
        keywords.add(normalized);
      }
    }
  }

  return Array.from(keywords);
}

function deriveThemes(videos: YoutubeVideoSummary[]): YoutubeThemeSuggestion[] {
  const map = new Map<string, { score: number; videos: YoutubeVideoSummary[] }>();

  for (const video of videos) {
    const scoreBase = video.viewVelocity ?? video.viewCount ?? 0;
    if (!scoreBase) continue;
    const keywords = extractKeywords(video);
    for (const keyword of keywords) {
      const existing = map.get(keyword);
      if (existing) {
        existing.score += scoreBase;
        if (existing.videos.length < 5) {
          existing.videos.push(video);
        }
      } else {
        map.set(keyword, { score: scoreBase, videos: [video] });
      }
    }
  }

  return Array.from(map.entries())
    .map(([keyword, value]) => ({
      keyword,
      score: value.score,
      representativeVideos: value.videos,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function toTimestamp(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value && 'value' in value) {
    const inner = (value as { value?: unknown }).value;
    return typeof inner === 'string' ? inner : undefined;
  }
  return undefined;
}

export async function getYoutubeDashboardData(): Promise<YoutubeDashboardData> {
  try {
    const projectId = resolveProjectId();
    const datasetId = process.env.YOUTUBE_BQ_DATASET_ID ?? 'autostudio_media';
    const client = createBigQueryClient(projectId);

    console.log('[youtube/dashboard] Fetching latest snapshot date...');
    const [latestRowsRaw] = await client.query({
      query: `
        SELECT MAX(snapshot_date) AS snapshot_date
        FROM \`${projectId}.${datasetId}.media_videos_snapshot\`
        WHERE media = 'youtube'
      `,
    });

    const latestRows = latestRowsRaw as Array<{ snapshot_date: string | null }>;
    const latestSnapshotDate = latestRows[0]?.snapshot_date ?? null;
    console.log('[youtube/dashboard] Latest snapshot date:', latestSnapshotDate);

    console.log('[youtube/dashboard] Fetching overview metrics...');
    const [overviewRowsRaw] = await client.query({
      query: `
        SELECT
          COALESCE(SUM(CASE WHEN metric_type = 'views' THEN value ELSE 0 END), 0) AS total_views_30d,
          COALESCE(SUM(CASE WHEN metric_type = 'estimatedMinutesWatched' THEN value ELSE 0 END), 0) AS total_watch_minutes_30d,
          COALESCE(SUM(CASE WHEN metric_type = 'subscribersGained' THEN value ELSE 0 END)
            - SUM(CASE WHEN metric_type = 'subscribersLost' THEN value ELSE 0 END), 0) AS subscriber_delta_30d
        FROM \`${projectId}.${datasetId}.media_metrics_daily\`
        WHERE media = 'youtube'
          AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
      `,
    });

    const overviewRows = overviewRowsRaw as Array<{
      total_views_30d: number | null;
      total_watch_minutes_30d: number | null;
      subscriber_delta_30d: number | null;
    }>;

    const overviewRow = overviewRows[0] ?? {
      total_views_30d: 0,
      total_watch_minutes_30d: 0,
      subscriber_delta_30d: 0,
    };

    console.log('[youtube/dashboard] Overview metrics:', overviewRow);

  let topVideos: YoutubeVideoSummary[] = [];
  if (latestSnapshotDate) {
    console.log('[youtube/dashboard] Fetching top videos...');
    const [videoRowsRaw] = await client.query({
      query: `
        SELECT
          v.content_id,
          v.title,
          v.channel_id,
          c.channel_title,
          v.view_count,
          v.like_count,
          v.comment_count,
          v.view_velocity,
          v.engagement_rate,
          v.published_at,
          v.tags
        FROM \`${projectId}.${datasetId}.media_videos_snapshot\` v
        LEFT JOIN \`${projectId}.${datasetId}.media_channels_snapshot\` c
          ON v.channel_id = c.channel_id
          AND v.snapshot_date = c.snapshot_date
          AND c.media = 'youtube'
        WHERE v.media = 'youtube'
          AND v.snapshot_date = @snapshot_date
          AND (c.is_self = TRUE OR c.is_self IS NULL)
        ORDER BY CASE
          WHEN v.view_velocity IS NOT NULL THEN v.view_velocity
          WHEN v.view_count IS NOT NULL THEN v.view_count
          ELSE 0
        END DESC
        LIMIT 60
      `,
      params: { snapshot_date: latestSnapshotDate },
    });

    const seenVideoIds = new Set<string>();
    topVideos = (videoRowsRaw as Array<{
      content_id: string;
      title: string | null;
      channel_id: string;
      channel_title: string | null;
      view_count: number | null;
      like_count: number | null;
      comment_count: number | null;
      view_velocity: number | null;
      engagement_rate: number | null;
      published_at: unknown;
      tags: string[] | null;
    }> )
      .map((row) => {
        const publishedAtRaw = toTimestamp(row.published_at);
        return {
          videoId: row.content_id,
          title: row.title ?? '',
          channelId: row.channel_id,
          channelTitle: row.channel_title ?? undefined,
          viewCount: row.view_count ?? undefined,
          likeCount: row.like_count ?? undefined,
          commentCount: row.comment_count ?? undefined,
          viewVelocity: row.view_velocity ?? undefined,
          engagementRate: row.engagement_rate ?? undefined,
          publishedAt: publishedAtRaw ? new Date(publishedAtRaw).toISOString() : undefined,
          tags: row.tags ?? undefined,
        };
      })
      .filter((video) => {
        if (seenVideoIds.has(video.videoId)) return false;
        seenVideoIds.add(video.videoId);
        return true;
      })
      .slice(0, 30);
  }

  const themes = deriveThemes(topVideos);

  console.log('[youtube/dashboard] Building analytics summary...');
  let analytics;
  try {
    analytics = await buildAnalyticsSummary(client, projectId, datasetId, latestSnapshotDate ?? undefined);
  } catch (error) {
    console.warn('[youtube/dashboard] Failed to build analytics summary, using defaults:', error);
    analytics = {
      own: {
        last30Days: { views: 0, watchTimeMinutes: 0, averageViewDurationSeconds: 0, subscriberNet: 0 },
        last7Days: { views: 0, watchTimeMinutes: 0, averageViewDurationSeconds: 0, subscriberNet: 0 },
      },
      comparison: null,
    };
  }

  console.log('[youtube/dashboard] Building competitor summary...');
  let competitors: YoutubeCompetitorSummary[] = [];
  if (latestSnapshotDate) {
    try {
      competitors = await buildCompetitorSummary(client, projectId, datasetId, latestSnapshotDate);
    } catch (error) {
      console.warn('[youtube/dashboard] Failed to build competitor summary, using empty array:', error);
      competitors = [];
    }
  }

  // Fetch LINE registration count for the last 30 days
  let lineRegistrationCount: number | null = null;
  try {
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 30);

    lineRegistrationCount = await countLineSourceRegistrations(projectId, {
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      sourceName: 'YouTube',
    });
  } catch (lineError) {
    console.warn('[youtube/dashboard] Failed to load LINE registration count', lineError);
  }

  console.log('[youtube/dashboard] Dashboard data fetching completed successfully');
  return {
      overview: {
        totalViews30d: Number(overviewRow.total_views_30d) || 0,
        avgViewDuration:
          overviewRow.total_views_30d && overviewRow.total_views_30d > 0
            ? ((Number(overviewRow.total_watch_minutes_30d) || 0) * 60) / Number(overviewRow.total_views_30d)
            : 0,
        subscriberDelta30d: Number(overviewRow.subscriber_delta_30d) || 0,
        latestSnapshotDate,
      },
      topVideos,
      themes,
      analytics,
      competitors,
      lineRegistrationCount,
    };
  } catch (error) {
    console.error('[youtube/dashboard] Error fetching dashboard data:', error);
    throw new Error(`Failed to fetch YouTube dashboard data: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function buildAnalyticsSummary(
  client: ReturnType<typeof createBigQueryClient>,
  projectId: string,
  datasetId: string,
  latestSnapshotDate?: string,
) {
  try {
    console.log('[youtube/dashboard] Querying analytics metrics...');
    const [ownRows] = await client.query({
      query: `
        SELECT
          metric_type,
          SUM(IF(date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY), value, 0)) AS total_30,
          SUM(IF(date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY), value, 0)) AS total_7
        FROM \`${projectId}.${datasetId}.media_metrics_daily\`
        WHERE media = 'youtube'
        GROUP BY metric_type
      `,
    });
    console.log('[youtube/dashboard] Analytics query returned', ownRows.length, 'rows');

  const metrics = new Map<string, { total_30: number; total_7: number }>();
  for (const row of ownRows as Array<{ metric_type: string; total_30: number | null; total_7: number | null }>) {
    metrics.set(row.metric_type, {
      total_30: Number(row.total_30 ?? 0),
      total_7: Number(row.total_7 ?? 0),
    });
  }

  const views30 = metrics.get('views')?.total_30 ?? 0;
  const views7 = metrics.get('views')?.total_7 ?? 0;
  const watchMinutes30 = metrics.get('estimatedMinutesWatched')?.total_30 ?? 0;
  const watchMinutes7 = metrics.get('estimatedMinutesWatched')?.total_7 ?? 0;
  const subscribersGained30 = metrics.get('subscribersGained')?.total_30 ?? 0;
  const subscribersGained7 = metrics.get('subscribersGained')?.total_7 ?? 0;
  const subscribersLost30 = metrics.get('subscribersLost')?.total_30 ?? 0;
  const subscribersLost7 = metrics.get('subscribersLost')?.total_7 ?? 0;

  const ownSummary30: AnalyticsSummary = {
    views: Math.round(views30),
    watchTimeMinutes: Math.round(watchMinutes30),
    averageViewDurationSeconds: views30 > 0 ? Math.round((watchMinutes30 * 60) / views30) : 0,
    subscriberNet: Math.round(subscribersGained30 - subscribersLost30),
  };

  const ownSummary7: AnalyticsSummary = {
    views: Math.round(views7),
    watchTimeMinutes: Math.round(watchMinutes7),
    averageViewDurationSeconds: views7 > 0 ? Math.round((watchMinutes7 * 60) / views7) : 0,
    subscriberNet: Math.round(subscribersGained7 - subscribersLost7),
  };

  let comparison: ComparisonSummary | null = null;

  if (latestSnapshotDate) {
    const [comparisonRows] = await client.query({
      query: `
        WITH latest_self AS (
          SELECT
            AVG(view_velocity) AS own_view_velocity,
            AVG(engagement_rate) AS own_engagement_rate
          FROM \`${projectId}.${datasetId}.media_videos_snapshot\` v
          LEFT JOIN \`${projectId}.${datasetId}.media_channels_snapshot\` c
            ON v.channel_id = c.channel_id AND v.snapshot_date = c.snapshot_date
          WHERE v.media = 'youtube'
            AND v.snapshot_date = @snapshot_date
            AND (c.is_self = TRUE OR c.is_self IS NULL)
        ),
        latest_competitors AS (
          SELECT
            AVG(view_velocity) AS competitor_view_velocity,
            AVG(engagement_rate) AS competitor_engagement_rate
          FROM \`${projectId}.${datasetId}.media_videos_snapshot\` v
          JOIN \`${projectId}.${datasetId}.media_channels_snapshot\` c
            ON v.channel_id = c.channel_id AND v.snapshot_date = c.snapshot_date
          WHERE v.media = 'youtube'
            AND v.snapshot_date = @snapshot_date
            AND (c.is_self IS NULL OR c.is_self = FALSE)
        )
        SELECT
          own_view_velocity,
          own_engagement_rate,
          competitor_view_velocity,
          competitor_engagement_rate
        FROM latest_self CROSS JOIN latest_competitors
      `,
      params: { snapshot_date: latestSnapshotDate },
    });

    const row = (comparisonRows as Array<{
      own_view_velocity: number | null;
      own_engagement_rate: number | null;
      competitor_view_velocity: number | null;
      competitor_engagement_rate: number | null;
    }>)[0];

    if (row) {
      comparison = {
        ownViewVelocity: row.own_view_velocity ?? null,
        competitorViewVelocity: row.competitor_view_velocity ?? null,
        ownEngagementRate: row.own_engagement_rate ?? null,
        competitorEngagementRate: row.competitor_engagement_rate ?? null,
      };
    }
  }

  return {
    own: {
      last30Days: ownSummary30,
      last7Days: ownSummary7,
    },
    comparison,
  };
  } catch (error) {
    console.error('[youtube/dashboard] Error in buildAnalyticsSummary:', error);
    throw error;
  }
}

async function buildCompetitorSummary(
  client: ReturnType<typeof createBigQueryClient>,
  projectId: string,
  datasetId: string,
  snapshotDate: string,
): Promise<YoutubeCompetitorSummary[]> {
  try {
    console.log('[youtube/dashboard] Querying competitor data...');
    const [rows] = await client.query({
    query: `
      WITH ranked_channels AS (
        SELECT
          channel_id,
          channel_title,
          subscriber_count,
          view_count,
          video_count,
          collected_at,
          ROW_NUMBER() OVER (PARTITION BY channel_id ORDER BY collected_at DESC) AS rn
        FROM \`${projectId}.${datasetId}.media_channels_snapshot\`
        WHERE media = 'youtube'
          AND snapshot_date = @snapshot_date
          AND (is_self IS NULL OR is_self = FALSE)
      ),
      latest_channels AS (
        SELECT channel_id, channel_title, subscriber_count, view_count, video_count
        FROM ranked_channels
        WHERE rn = 1
      ),
      channel_video_stats AS (
        SELECT
          channel_id,
          AVG(view_velocity) AS avg_view_velocity,
          AVG(engagement_rate) AS avg_engagement_rate
        FROM \`${projectId}.${datasetId}.media_videos_snapshot\`
        WHERE media = 'youtube'
          AND snapshot_date = @snapshot_date
        GROUP BY channel_id
      ),
      latest_video AS (
        SELECT
          channel_id,
          title,
          view_count,
          published_at,
          ROW_NUMBER() OVER (
            PARTITION BY channel_id
            ORDER BY SAFE_CAST(published_at AS TIMESTAMP) DESC
          ) AS rn
        FROM \`${projectId}.${datasetId}.media_videos_snapshot\`
        WHERE media = 'youtube'
          AND snapshot_date = @snapshot_date
      )
      SELECT
        c.channel_id,
        c.channel_title,
        c.subscriber_count,
        c.view_count,
        c.video_count,
        s.avg_view_velocity,
        s.avg_engagement_rate,
        v.title AS latest_video_title,
        v.view_count AS latest_video_view_count,
        v.published_at AS latest_video_published_at
      FROM latest_channels c
      LEFT JOIN channel_video_stats s USING (channel_id)
      LEFT JOIN (
        SELECT * FROM latest_video WHERE rn = 1
      ) v USING (channel_id)
      ORDER BY s.avg_view_velocity DESC NULLS LAST
      LIMIT 10
    `,
    params: { snapshot_date: snapshotDate },
  });

  return (rows as Array<{
    channel_id: string;
    channel_title: string | null;
    subscriber_count: number | null;
    view_count: number | null;
    video_count: number | null;
    avg_view_velocity: number | null;
    avg_engagement_rate: number | null;
    latest_video_title: string | null;
    latest_video_view_count: number | null;
    latest_video_published_at: unknown;
  }>).map((row) => ({
    channelId: row.channel_id,
    channelTitle: row.channel_title ?? row.channel_id,
    subscriberCount: row.subscriber_count ?? undefined,
    viewCount: row.view_count ?? undefined,
    videoCount: row.video_count ?? undefined,
    avgViewVelocity: row.avg_view_velocity ?? null,
    avgEngagementRate: row.avg_engagement_rate ?? null,
    latestVideoTitle: row.latest_video_title ?? undefined,
    latestVideoViewCount: row.latest_video_view_count ?? null,
    latestVideoPublishedAt: (() => {
      const ts = toTimestamp(row.latest_video_published_at);
      return ts ? new Date(ts).toISOString() : undefined;
    })(),
  }));
  } catch (error) {
    console.error('[youtube/dashboard] Error in buildCompetitorSummary:', error);
    throw error;
  }
}
