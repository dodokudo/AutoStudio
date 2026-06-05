import type { BigQuery } from '@google-cloud/bigquery';
import type { InstagramAccessContext } from './auth';

const GRAPH_VERSION = process.env.IG_GRAPH_VERSION ?? 'v25.0';
const GRAPH_BASE = process.env.IG_GRAPH_BASE ?? `https://graph.facebook.com/${GRAPH_VERSION}`;

const DAILY_METRICS = [
  'reach',
  'views',
  'total_interactions',
  'accounts_engaged',
  'profile_views',
  'profile_links_taps',
  'website_clicks',
  'likes',
  'comments',
  'shares',
  'saves',
  'replies',
  'reposts',
];

export interface UserInsightSnapshotRow {
  snapshot_at: string;
  snapshot_date: string;
  user_id: string;
  instagram_user_id: string;
  instagram_username: string | null;
  followers_count: number | null;
  follows_count: number | null;
  media_count: number | null;
  reach: number | null;
  views: number | null;
  total_interactions: number | null;
  accounts_engaged: number | null;
  profile_views: number | null;
  profile_links_taps: number | null;
  website_clicks: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  replies: number | null;
  reposts: number | null;
  raw_metrics_json: string;
}

interface GraphResponse<T> {
  data?: T[];
  error?: { message: string; code: number };
}

interface MetricValue {
  value: number | Record<string, number>;
  end_time?: string;
}

interface InsightMetric {
  name: string;
  values?: MetricValue[];
  total_value?: { value: number };
}

interface AccountFields {
  id: string;
  username?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}

async function graphRequest<T>(path: string, accessToken: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GRAPH_BASE}/${path}`);
  url.searchParams.set('access_token', accessToken);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url.toString());
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Instagram Graph API error ${response.status}: ${body}`);
  }
  return response.json() as Promise<T>;
}

function toNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function extractValue(metric: InsightMetric): number | null {
  if (metric.total_value?.value !== undefined) {
    return toNumber(metric.total_value.value);
  }
  const first = metric.values?.[0]?.value;
  if (typeof first === 'number') return first;
  if (typeof first === 'object' && first !== null) {
    return Object.values(first).reduce((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
  }
  return null;
}

export async function fetchUserInsightsSnapshot(
  context: InstagramAccessContext,
  snapshotAt: Date = new Date(),
): Promise<UserInsightSnapshotRow> {
  const accountInfo = await graphRequest<AccountFields>(context.instagramUserId, context.accessToken, {
    fields: 'id,username,followers_count,follows_count,media_count',
  });

  const yesterday = new Date(snapshotAt.getTime() - 24 * 60 * 60 * 1000);
  const since = Math.floor(yesterday.getTime() / 1000);
  const until = Math.floor(snapshotAt.getTime() / 1000);

  let insights: InsightMetric[] = [];
  try {
    const response = await graphRequest<GraphResponse<InsightMetric>>(
      `${context.instagramUserId}/insights`,
      context.accessToken,
      {
        metric: DAILY_METRICS.join(','),
        period: 'day',
        metric_type: 'total_value',
        since: String(since),
        until: String(until),
      },
    );
    insights = response.data ?? [];
  } catch (error) {
    console.warn('[instagram/userInsights] Failed to fetch daily insights, falling back per metric', error);
    for (const metric of DAILY_METRICS) {
      try {
        const response = await graphRequest<GraphResponse<InsightMetric>>(
          `${context.instagramUserId}/insights`,
          context.accessToken,
          {
            metric,
            period: 'day',
            metric_type: 'total_value',
            since: String(since),
            until: String(until),
          },
        );
        insights.push(...(response.data ?? []));
      } catch (err) {
        console.warn(`[instagram/userInsights] metric ${metric} skipped:`, (err as Error).message);
      }
    }
  }

  const metricMap = insights.reduce<Record<string, number | null>>((acc, m) => {
    acc[m.name] = extractValue(m);
    return acc;
  }, {});

  const snapshotIso = snapshotAt.toISOString();
  const snapshotDate = snapshotIso.slice(0, 10);

  return {
    snapshot_at: snapshotIso,
    snapshot_date: snapshotDate,
    user_id: context.autostudioUserId,
    instagram_user_id: context.instagramUserId,
    instagram_username: accountInfo.username ?? null,
    followers_count: toNumber(accountInfo.followers_count),
    follows_count: toNumber(accountInfo.follows_count),
    media_count: toNumber(accountInfo.media_count),
    reach: toNumber(metricMap.reach),
    views: toNumber(metricMap.views),
    total_interactions: toNumber(metricMap.total_interactions),
    accounts_engaged: toNumber(metricMap.accounts_engaged),
    profile_views: toNumber(metricMap.profile_views),
    profile_links_taps: toNumber(metricMap.profile_links_taps),
    website_clicks: toNumber(metricMap.website_clicks),
    likes: toNumber(metricMap.likes),
    comments: toNumber(metricMap.comments),
    shares: toNumber(metricMap.shares),
    saves: toNumber(metricMap.saves),
    replies: toNumber(metricMap.replies),
    reposts: toNumber(metricMap.reposts),
    raw_metrics_json: JSON.stringify(insights),
  };
}

export async function insertUserInsightsSnapshot(
  bigquery: BigQuery,
  dataset: string,
  row: UserInsightSnapshotRow,
): Promise<void> {
  const created_at = new Date().toISOString();
  await bigquery.dataset(dataset).table('instagram_user_insights_snapshots').insert([{ ...row, created_at }]);
}
