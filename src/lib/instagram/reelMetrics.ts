import { spawn } from 'node:child_process';
import type { BigQuery } from '@google-cloud/bigquery';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import type { InstagramAccessContext } from './auth';
import type { InstagramReelMetricSnapshotRow } from './bigquery';

const GRAPH_VERSION = process.env.IG_GRAPH_VERSION ?? 'v25.0';
const GRAPH_BASE = process.env.IG_GRAPH_BASE ?? `https://graph.facebook.com/${GRAPH_VERSION}`;
const FFPROBE_PATH = process.env.FFPROBE_PATH ?? ffprobeInstaller.path;
const FFPROBE_TIMEOUT_MS = 20_000;

const MEDIA_FIELDS = [
  'id',
  'caption',
  'media_type',
  'media_product_type',
  'permalink',
  'timestamp',
  'thumbnail_url',
  'media_url',
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
  media_url?: string;
}

export function getVideoDuration(mediaUrl: string): Promise<number | null> {
  return new Promise((resolve) => {
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      mediaUrl,
    ];
    let settled = false;
    const proc = spawn(FFPROBE_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      proc.kill('SIGKILL');
      resolve(null);
    }, FFPROBE_TIMEOUT_MS);

    let stdout = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.warn('[instagram/reelMetrics] ffprobe spawn error:', err);
      resolve(null);
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        resolve(null);
        return;
      }
      const value = Number.parseFloat(stdout.trim());
      resolve(Number.isFinite(value) && value > 0 ? value : null);
    });
  });
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
  durationSeconds: number | null;
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

function normalizeTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function completionRate(avgWatchMs: number | null, durationSeconds: number | null): number | null {
  if (!avgWatchMs || !durationSeconds || durationSeconds <= 0) {
    return null;
  }
  return (avgWatchMs / 1000) / durationSeconds;
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

export async function fetchAllReelsSince(
  context: InstagramAccessContext,
  sinceIso: string,
  pageLimit = 100,
  maxPages = 50,
): Promise<InstagramGraphMedia[]> {
  const all: InstagramGraphMedia[] = [];
  const sinceMs = new Date(sinceIso).getTime();
  let nextUrl: string | null = null;
  let page = 0;

  do {
    page += 1;
    const result: GraphList<InstagramGraphMedia> = nextUrl
      ? await graphRequest<GraphList<InstagramGraphMedia>>(nextUrl, context.accessToken)
      : await graphRequest<GraphList<InstagramGraphMedia>>(
          `${context.instagramUserId}/media`,
          context.accessToken,
          { fields: MEDIA_FIELDS, limit: String(pageLimit) },
        );

    const pageItems = result.data ?? [];
    let reachedCutoff = false;
    for (const m of pageItems) {
      const ts = m.timestamp ? new Date(m.timestamp).getTime() : 0;
      if (ts && ts < sinceMs) {
        reachedCutoff = true;
        continue;
      }
      if (m.media_product_type === 'REELS' || m.media_type === 'VIDEO') {
        all.push(m);
      }
    }
    console.log(`[fetchAllReelsSince] page ${page}: ${pageItems.length} items, kept ${all.length} reels`);
    if (reachedCutoff) break;
    nextUrl = result.paging?.next ?? null;
  } while (nextUrl && page < maxPages);

  return all;
}

export async function probeReelMetrics(
  context: InstagramAccessContext,
  media: InstagramGraphMedia,
): Promise<ReelMetricProbeResult> {
  const [stable, experimental, durationSeconds] = await Promise.all([
    fetchMetricGroup(media.id, context.accessToken, STABLE_REEL_METRICS),
    fetchMetricGroup(media.id, context.accessToken, EXPERIMENTAL_REEL_METRICS),
    media.media_url ? getVideoDuration(media.media_url) : Promise.resolve(null),
  ]);
  const rawMetrics = [...stable.metrics, ...experimental.metrics];

  return {
    media,
    supportedMetrics: metricMap(rawMetrics),
    unsupportedMetrics: [...stable.unsupported, ...experimental.unsupported],
    rawMetrics,
    durationSeconds,
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
      timestamp: normalizeTimestamp(result.media.timestamp),
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
      duration_seconds: result.durationSeconds,
      completion_rate: completionRate(avgWatchMs, result.durationSeconds),
      metrics_status: result.unsupportedMetrics.length ? 'partial' : 'complete',
      unsupported_metrics: result.unsupportedMetrics,
      raw_metrics_json: JSON.stringify(result.rawMetrics),
    };
  });
}

export async function insertReelMetricSnapshots(
  bigquery: BigQuery,
  _projectId: string,
  dataset: string,
  _location: string,
  rows: InstagramReelMetricSnapshotRow[],
): Promise<void> {
  if (!rows.length) {
    console.log('[instagram/reelMetrics] No reel metric snapshots to insert.');
    return;
  }

  const createdAt = new Date().toISOString();
  const rowsToInsert = rows.map((row) => ({ ...row, created_at: createdAt }));

  await bigquery
    .dataset(dataset)
    .table('instagram_reel_metric_snapshots')
    .insert(rowsToInsert);
}
