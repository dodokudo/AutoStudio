import type { BigQuery } from '@google-cloud/bigquery';
import type { InstagramAccessContext } from './auth';

const GRAPH_VERSION = process.env.IG_GRAPH_VERSION ?? 'v25.0';
const GRAPH_BASE = process.env.IG_GRAPH_BASE ?? `https://graph.facebook.com/${GRAPH_VERSION}`;

const STORY_FIELDS = [
  'id',
  'media_type',
  'media_product_type',
  'permalink',
  'timestamp',
  'thumbnail_url',
  'media_url',
].join(',');

const STABLE_STORY_METRICS = [
  'views',
  'reach',
  'replies',
  'total_interactions',
  'shares',
];

const EXPERIMENTAL_STORY_METRICS = [
  'profile_visits',
  'follows',
  'navigation',
  'profile_activity',
];

interface GraphList<T> {
  data?: T[];
  paging?: { next?: string };
}

export interface InstagramGraphStory {
  id: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp?: string;
  thumbnail_url?: string;
  media_url?: string;
}

interface InsightValue {
  value: number | Record<string, number>;
}

interface InsightMetric {
  name: string;
  values?: InsightValue[];
}

export interface StoryMetricSnapshotRow {
  snapshot_at: string;
  snapshot_date: string;
  user_id: string;
  instagram_user_id: string;
  instagram_id: string;
  media_type: string | null;
  permalink: string | null;
  timestamp: string | null;
  thumbnail_url: string | null;
  views: number | null;
  reach: number | null;
  replies: number | null;
  shares: number | null;
  total_interactions: number | null;
  profile_visits: number | null;
  follows: number | null;
  navigation: number | null;
  profile_activity: number | null;
  metrics_status: string;
  unsupported_metrics: string[];
  raw_metrics_json: string;
}

export interface StoryMetricProbeResult {
  story: InstagramGraphStory;
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
  storyId: string,
  accessToken: string,
  metrics: string[],
): Promise<{ metrics: InsightMetric[]; unsupported: string[] }> {
  try {
    const result = await graphRequest<GraphList<InsightMetric>>(`${storyId}/insights`, accessToken, {
      metric: metrics.join(','),
    });
    return { metrics: result.data ?? [], unsupported: [] };
  } catch (error) {
    console.warn(`[instagram/storyMetrics] Metric group failed for ${storyId}: ${getErrorMessage(error)}`);
  }
  const fetched: InsightMetric[] = [];
  const unsupported: string[] = [];
  for (const metric of metrics) {
    try {
      const result = await graphRequest<GraphList<InsightMetric>>(`${storyId}/insights`, accessToken, {
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
  if (typeof first === 'object' && first !== null) {
    return Object.values(first).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
  }
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

export async function fetchActiveStories(
  context: InstagramAccessContext,
): Promise<InstagramGraphStory[]> {
  const result = await graphRequest<GraphList<InstagramGraphStory>>(
    `${context.instagramUserId}/stories`,
    context.accessToken,
    { fields: STORY_FIELDS },
  );
  return result.data ?? [];
}

export async function probeStoryMetrics(
  context: InstagramAccessContext,
  story: InstagramGraphStory,
): Promise<StoryMetricProbeResult> {
  const [stable, experimental] = await Promise.all([
    fetchMetricGroup(story.id, context.accessToken, STABLE_STORY_METRICS),
    fetchMetricGroup(story.id, context.accessToken, EXPERIMENTAL_STORY_METRICS),
  ]);
  const rawMetrics = [...stable.metrics, ...experimental.metrics];
  return {
    story,
    supportedMetrics: metricMap(rawMetrics),
    unsupportedMetrics: [...stable.unsupported, ...experimental.unsupported],
    rawMetrics,
  };
}

export function buildStorySnapshotRows(
  context: InstagramAccessContext,
  probeResults: StoryMetricProbeResult[],
  snapshotAt = new Date(),
): StoryMetricSnapshotRow[] {
  const snapshotIso = snapshotAt.toISOString();
  const snapshotDate = snapshotIso.slice(0, 10);

  return probeResults.map((result) => {
    const metrics = result.supportedMetrics;
    return {
      snapshot_at: snapshotIso,
      snapshot_date: snapshotDate,
      user_id: context.autostudioUserId,
      instagram_user_id: context.instagramUserId,
      instagram_id: result.story.id,
      media_type: result.story.media_type ?? null,
      permalink: result.story.permalink ?? null,
      timestamp: normalizeTimestamp(result.story.timestamp),
      thumbnail_url: result.story.thumbnail_url ?? null,
      views: toNumber(metrics.views),
      reach: toNumber(metrics.reach),
      replies: toNumber(metrics.replies),
      shares: toNumber(metrics.shares),
      total_interactions: toNumber(metrics.total_interactions),
      profile_visits: toNumber(metrics.profile_visits),
      follows: toNumber(metrics.follows),
      navigation: toNumber(metrics.navigation),
      profile_activity: toNumber(metrics.profile_activity),
      metrics_status: result.unsupportedMetrics.length ? 'partial' : 'complete',
      unsupported_metrics: result.unsupportedMetrics,
      raw_metrics_json: JSON.stringify(result.rawMetrics),
    };
  });
}

export async function insertStorySnapshots(
  bigquery: BigQuery,
  dataset: string,
  rows: StoryMetricSnapshotRow[],
): Promise<void> {
  if (!rows.length) {
    console.log('[instagram/storyMetrics] No story snapshots to insert.');
    return;
  }
  const createdAt = new Date().toISOString();
  const rowsToInsert = rows.map((row) => ({ ...row, created_at: createdAt }));
  await bigquery.dataset(dataset).table('instagram_story_metric_snapshots').insert(rowsToInsert);
}
