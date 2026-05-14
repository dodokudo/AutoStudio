import type { BigQuery } from '@google-cloud/bigquery';
import type { InstagramAccessContext } from './auth';
import type { InstagramReelMetricSnapshotRow } from './bigquery';

const GRAPH_VERSION = process.env.IG_GRAPH_VERSION ?? 'v25.0';
const GRAPH_BASE = process.env.IG_GRAPH_BASE ?? `https://graph.facebook.com/${GRAPH_VERSION}`;

const MEDIA_FIELDS = [
  'id',
  'caption',
  'media_type',
  'media_product_type',
  'permalink',
  'timestamp',
  'thumbnail_url',
].join(',');

const STABLE_REEL_METRICS = [
  'views',
  'reach',
  'likes',
  'comments',
  'saved',
  'shares',
  'total_interactions',
  'ig_reels_avg_watch_time',
  'ig_reels_video_view_total_time',
];

const EXPERIMENTAL_REEL_METRICS = [
  'reels_skip_rate',
  'reposts',
  'crossposted_views',
  'facebook_views',
  'profile_activity',
  'follows',
];

interface GraphList<T> {
  data?: T[];
  paging?: {
    next?: string;
  };
}

export interface InstagramGraphMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp?: string;
  thumbnail_url?: string;
}

interface InsightValue {
  value: number | Record<string, number>;
}

interface InsightMetric {
  name: string;
  values?: InsightValue[];
}

export interface ReelMetricProbeResult {
  media: InstagramGraphMedia;
  supportedMetrics: Record<string, number | null>;
  unsupportedMetrics: string[];
  rawMetrics: InsightMetric[];
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function graphRequest<T>(pathOrUrl: string, accessToken: string, params?: Record<string, string>): Promise<T> {
  const url = pathOrUrl.startsWith('https://') ? new URL(pathOrUrl) : new URL(`${GRAPH_BASE}/${pathOrUrl}`);
  url.searchParams.set('access_token', accessToken);
  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Instagram Graph API error ${response.status}: ${body}`);
  }

  return response.json() as Promise<T>;
}

async function fetchMetricGroup(
  mediaId: string,
  accessToken: string,
  metrics: string[],
): Promise<{ metrics: InsightMetric[]; unsupported: string[] }> {
  try {
    const result = await graphRequest<GraphList<InsightMetric>>(`${mediaId}/insights`, accessToken, {
      metric: metrics.join(','),
    });
    return { metrics: result.data ?? [], unsupported: [] };
  } catch (error) {
    console.warn(`[instagram/reelMetrics] Metric group failed for ${mediaId}: ${getErrorMessage(error)}`);
  }

  const fetched: InsightMetric[] = [];
  const unsupported: string[] = [];
  for (const metric of metrics) {
    try {
      const result = await graphRequest<GraphList<InsightMetric>>(`${mediaId}/insights`, accessToken, {
        metric,
      });
      fetched.push(...(result.data ?? []));
    } catch {
      unsupported.push(metric);
    }
  }

  return { metrics: fetched, unsupported };
}

function metricValue(metric: InsightMetric): number | null {
  const first = metric.values?.[0]?.value;
  if (typeof first === 'number') return first;
  return null;
}

function metricMap(metrics: InsightMetric[]): Record<string, number | null> {
  return metrics.reduce<Record<string, number | null>>((acc, metric) => {
    acc[metric.name] = metricValue(metric);
    return acc;
  }, {});
}

function toNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function completionRate(avgWatchMs: number | null, media: InstagramGraphMedia): number | null {
  const durationSeconds = Number((media as InstagramGraphMedia & { duration?: unknown }).duration);
  if (!avgWatchMs || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }
  return avgWatchMs / 1000 / durationSeconds;
}

export async function fetchRecentReels(
  context: InstagramAccessContext,
  limit = 10,
): Promise<InstagramGraphMedia[]> {
  const result = await graphRequest<GraphList<InstagramGraphMedia>>(
    `${context.instagramUserId}/media`,
    context.accessToken,
    {
      fields: MEDIA_FIELDS,
      limit: String(limit),
    },
  );

  return (result.data ?? []).filter((media) => (
    media.media_product_type === 'REELS' || media.media_type === 'VIDEO'
  ));
}

export async function probeReelMetrics(
  context: InstagramAccessContext,
  media: InstagramGraphMedia,
): Promise<ReelMetricProbeResult> {
  const stable = await fetchMetricGroup(media.id, context.accessToken, STABLE_REEL_METRICS);
  const experimental = await fetchMetricGroup(media.id, context.accessToken, EXPERIMENTAL_REEL_METRICS);
  const rawMetrics = [...stable.metrics, ...experimental.metrics];

  return {
    media,
    supportedMetrics: metricMap(rawMetrics),
    unsupportedMetrics: [...stable.unsupported, ...experimental.unsupported],
    rawMetrics,
  };
}

export function buildSnapshotRows(
  context: InstagramAccessContext,
  probeResults: ReelMetricProbeResult[],
  snapshotAt = new Date(),
): InstagramReelMetricSnapshotRow[] {
  const snapshotIso = snapshotAt.toISOString();
  const snapshotDate = snapshotIso.slice(0, 10);

  return probeResults.map((result) => {
    const metrics = result.supportedMetrics;
    const avgWatchMs = toNumber(metrics.ig_reels_avg_watch_time);

    return {
      snapshot_at: snapshotIso,
      snapshot_date: snapshotDate,
      user_id: context.autostudioUserId,
      instagram_user_id: context.instagramUserId,
      instagram_id: result.media.id,
      caption: result.media.caption ?? null,
      media_product_type: result.media.media_product_type ?? null,
      media_type: result.media.media_type ?? null,
      permalink: result.media.permalink ?? null,
      timestamp: result.media.timestamp ?? null,
      thumbnail_url: result.media.thumbnail_url ?? null,
      views: toNumber(metrics.views),
      reach: toNumber(metrics.reach),
      likes: toNumber(metrics.likes),
      comments: toNumber(metrics.comments),
      saved: toNumber(metrics.saved),
      shares: toNumber(metrics.shares),
      reposts: toNumber(metrics.reposts),
      total_interactions: toNumber(metrics.total_interactions),
      ig_reels_avg_watch_time_ms: avgWatchMs,
      ig_reels_video_view_total_time_ms: toNumber(metrics.ig_reels_video_view_total_time),
      reels_skip_rate: toNumber(metrics.reels_skip_rate),
      crossposted_views: toNumber(metrics.crossposted_views),
      facebook_views: toNumber(metrics.facebook_views),
      profile_activity: toNumber(metrics.profile_activity),
      follows: toNumber(metrics.follows),
      completion_rate: completionRate(avgWatchMs, result.media),
      metrics_status: result.unsupportedMetrics.length ? 'partial' : 'complete',
      unsupported_metrics: result.unsupportedMetrics,
      raw_metrics_json: JSON.stringify(result.rawMetrics),
    };
  });
}

export async function insertReelMetricSnapshots(
  bigquery: BigQuery,
  projectId: string,
  dataset: string,
  location: string,
  rows: InstagramReelMetricSnapshotRow[],
): Promise<void> {
  if (!rows.length) {
    console.log('[instagram/reelMetrics] No reel metric snapshots to insert.');
    return;
  }

  await bigquery.query({
    query: `
      INSERT INTO \`${projectId}.${dataset}.instagram_reel_metric_snapshots\` (
        snapshot_at,
        snapshot_date,
        user_id,
        instagram_user_id,
        instagram_id,
        caption,
        media_product_type,
        media_type,
        permalink,
        timestamp,
        thumbnail_url,
        views,
        reach,
        likes,
        comments,
        saved,
        shares,
        reposts,
        total_interactions,
        ig_reels_avg_watch_time_ms,
        ig_reels_video_view_total_time_ms,
        reels_skip_rate,
        crossposted_views,
        facebook_views,
        profile_activity,
        follows,
        completion_rate,
        metrics_status,
        unsupported_metrics,
        raw_metrics_json,
        created_at
      )
      SELECT
        TIMESTAMP(S.snapshot_at),
        PARSE_DATE('%Y-%m-%d', S.snapshot_date),
        S.user_id,
        S.instagram_user_id,
        S.instagram_id,
        S.caption,
        S.media_product_type,
        S.media_type,
        S.permalink,
        SAFE.TIMESTAMP(S.timestamp),
        S.thumbnail_url,
        S.views,
        S.reach,
        S.likes,
        S.comments,
        S.saved,
        S.shares,
        S.reposts,
        S.total_interactions,
        S.ig_reels_avg_watch_time_ms,
        S.ig_reels_video_view_total_time_ms,
        S.reels_skip_rate,
        S.crossposted_views,
        S.facebook_views,
        S.profile_activity,
        S.follows,
        S.completion_rate,
        S.metrics_status,
        S.unsupported_metrics,
        S.raw_metrics_json,
        CURRENT_TIMESTAMP()
      FROM UNNEST(@rows) S
    `,
    params: { rows },
    location,
  });
}
