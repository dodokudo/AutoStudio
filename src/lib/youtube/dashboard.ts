import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

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

  const themes = Array.from(map.entries())
    .map(([keyword, value]) => ({
      keyword,
      score: value.score,
      representativeVideos: value.videos,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return themes;
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
  const projectId = resolveProjectId();
  const datasetId = process.env.YOUTUBE_BQ_DATASET_ID ?? 'autostudio_media';
  const client = createBigQueryClient(projectId);

  const [latestRowsRaw] = await client.query({
    query: `
      SELECT MAX(snapshot_date) AS snapshot_date
      FROM \`${projectId}.${datasetId}.media_videos_snapshot\`
      WHERE media = 'youtube'
    `,
  });

  const latestRows = latestRowsRaw as Array<{ snapshot_date: string | null }>;

  const latestSnapshotDate = latestRows[0]?.snapshot_date
    ? (typeof latestRows[0].snapshot_date === 'string'
       ? latestRows[0].snapshot_date
       : new Date((latestRows[0].snapshot_date as { value?: string })?.value ?? latestRows[0].snapshot_date).toISOString().slice(0, 10))
    : null;

  const [overviewRowsRaw] = await client.query({
    query: `
      SELECT
        SUM(CASE WHEN metric_type = 'views' THEN value ELSE 0 END) AS total_views_30d,
        AVG(CASE WHEN metric_type = 'averageViewDuration' THEN value ELSE NULL END) AS avg_view_duration,
        SUM(CASE WHEN metric_type = 'subscribersGained' THEN value ELSE 0 END)
          - SUM(CASE WHEN metric_type = 'subscribersLost' THEN value ELSE 0 END) AS subscriber_delta_30d
      FROM \`${projectId}.${datasetId}.media_metrics_daily\`
      WHERE media = 'youtube'
        AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
    `,
  });

  const overviewRows = overviewRowsRaw as Array<{
    total_views_30d: number | null;
    avg_view_duration: number | null;
    subscriber_delta_30d: number | null;
  }>;

  const overviewRow = overviewRows[0] ?? {
    total_views_30d: 0,
    avg_view_duration: 0,
    subscriber_delta_30d: 0,
  };

  let topVideos: YoutubeVideoSummary[] = [];
  if (latestSnapshotDate) {
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
        ORDER BY v.view_velocity DESC
        LIMIT 30
      `,
      params: { snapshot_date: latestSnapshotDate },
    });

    const videoRows = videoRowsRaw as Array<{
      content_id: string;
      title: string | null;
      channel_id: string;
      channel_title: string | null;
      view_count: number | null;
      like_count: number | null;
      comment_count: number | null;
      view_velocity: number | null;
      engagement_rate: number | null;
      published_at: string | null;
      tags: string[] | null;
    }>;

    topVideos = videoRows.map((row) => ({
      videoId: row.content_id,
      title: row.title ?? '',
      channelId: row.channel_id,
      channelTitle: row.channel_title ?? undefined,
      viewCount: row.view_count ?? undefined,
      likeCount: row.like_count ?? undefined,
      commentCount: row.comment_count ?? undefined,
      viewVelocity: row.view_velocity ?? undefined,
      engagementRate: row.engagement_rate ?? undefined,
      publishedAt: toTimestamp(row.published_at) ? new Date(toTimestamp(row.published_at)!).toISOString() : undefined,
      tags: row.tags ?? undefined,
    }));
  }

  const themes = deriveThemes(topVideos);

  return {
    overview: {
      totalViews30d: overviewRow.total_views_30d ?? 0,
      avgViewDuration: overviewRow.avg_view_duration ?? 0,
      subscriberDelta30d: overviewRow.subscriber_delta_30d ?? 0,
      latestSnapshotDate,
    },
    topVideos,
    themes,
  };
}
