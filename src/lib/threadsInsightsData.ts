import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient, resolveProjectId } from './bigquery';
import type { ThreadInsights } from './threadsApi';

const DATASET = 'autostudio_threads';
const PROJECT_ID = resolveProjectId();
const POSTS_LIMIT = 120;
const CACHE_TTL_MS = 1000 * 60 * 5;

export interface PostInsight {
  planId: string;
  postedThreadId: string;
  postedAt: string;
  templateId: string;
  theme: string;
  mainText: string;
  comments: string[];
  insights: ThreadInsights;
}

export interface DailyFollowerMetric {
  date: string;
  followers: number;
}

export interface ThreadsInsightsActivity {
  posts: PostInsight[];
  dailyMetrics: DailyFollowerMetric[];
}

const client: BigQuery = createBigQueryClient(PROJECT_ID);
let cachedActivity: ThreadsInsightsActivity | null = null;
let cachedFetchedAt = 0;

function toPlain(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && 'value' in (value as Record<string, unknown>)) {
    const inner = (value as Record<string, unknown>).value;
    return typeof inner === 'string' ? inner : String(inner ?? '');
  }
  return String(value);
}

function normalizeTimestamp(value: unknown): string {
  const plain = toPlain(value);
  if (!plain) return '';
  const parsed = new Date(plain);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  // BigQueryが `2024-09-05 07:30:00 UTC` のように返すケースに対応
  const replaced = plain.replace(' UTC', 'Z').replace(' ', 'T');
  const reparsed = new Date(replaced);
  if (!Number.isNaN(reparsed.getTime())) {
    return reparsed.toISOString();
  }

  return plain;
}

function toDateOnly(value: string): string {
  return value.slice(0, 10);
}

export async function getThreadsInsightsData(): Promise<ThreadsInsightsActivity> {
  const now = Date.now();
  if (cachedActivity && now - cachedFetchedAt < CACHE_TTL_MS) {
    return cachedActivity;
  }

  let posts: PostInsight[] = [];
  try {
    const [rows] = await client.query({
      query: `
        SELECT
          post_id,
          posted_at,
          updated_at,
          content,
          impressions_total,
          likes_total
        FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
        WHERE post_id IS NOT NULL AND post_id != ''
        ORDER BY posted_at DESC NULLS LAST, updated_at DESC NULLS LAST
        LIMIT @limit
      `,
      params: { limit: POSTS_LIMIT },
    });

    posts = rows
      .map((row: Record<string, unknown>): PostInsight | null => {
        const postedThreadId = toPlain(row.post_id);
        if (!postedThreadId) {
          return null;
        }

        const postedAtRaw = row.posted_at ?? row.updated_at ?? new Date().toISOString();
        const postedAt = normalizeTimestamp(postedAtRaw) || new Date().toISOString();

        const impressions = Number(row.impressions_total ?? 0) || 0;
        const likes = Number(row.likes_total ?? 0) || 0;

        return {
          planId: postedThreadId,
          postedThreadId,
          postedAt,
          templateId: 'unknown',
          theme: 'Threads投稿',
          mainText: toPlain(row.content ?? '').slice(0, 600),
          comments: [],
          insights: {
            impressions,
            likes,
          },
        } satisfies PostInsight;
      })
      .filter((item): item is PostInsight => item !== null)
      .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());
  } catch (error) {
    console.error('[threadsInsightsData] Failed to read threads_posts', error);
  }

  let dailyMetrics: DailyFollowerMetric[] = [];
  try {
    const [rows] = await client.query({
      query: `
        SELECT
          date,
          followers_snapshot
        FROM \`${PROJECT_ID}.${DATASET}.threads_daily_metrics\`
        WHERE date IS NOT NULL
        ORDER BY date DESC
        LIMIT 90
      `,
    });

    dailyMetrics = rows
      .map((row: Record<string, unknown>) => {
        const dateString = toPlain(row.date);
        if (!dateString) return null;
        const followers = Number(row.followers_snapshot ?? 0) || 0;
        return {
          date: toDateOnly(dateString),
          followers,
        } satisfies DailyFollowerMetric;
      })
      .filter((item): item is DailyFollowerMetric => item !== null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (error) {
    console.error('[threadsInsightsData] Failed to read threads_daily_metrics', error);
  }

  cachedActivity = {
    posts,
    dailyMetrics,
  };
  cachedFetchedAt = now;
  return cachedActivity;
}
