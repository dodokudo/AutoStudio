import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient, resolveProjectId } from './bigquery';
import type { ThreadInsights } from './threadsApi';

const DATASET = 'autostudio_threads';
const PROJECT_ID = resolveProjectId();
const POSTS_LIMIT = 200;
const CACHE_TTL_MS = 1000 * 60 * 30;

export interface PostComment {
  commentId: string;
  parentPostId: string;
  text: string;
  timestamp: string;
  depth: number;
  views: number;
}

export interface PostInsight {
  planId: string;
  postedThreadId: string;
  postedAt: string;
  templateId: string;
  theme: string;
  mainText: string;
  comments: string[];
  commentData: PostComment[];
  insights: ThreadInsights;
}

export interface DailyFollowerMetric {
  date: string;
  followers: number;
}

export interface DailyPostStats {
  date: string;
  postCount: number;
  impressions: number;
  likes: number;
}

export interface ThreadsInsightsActivity {
  posts: PostInsight[];
  dailyMetrics: DailyFollowerMetric[];
}

const client: BigQuery = createBigQueryClient(PROJECT_ID);
let cachedActivity: ThreadsInsightsActivity | null = null;
let cachedFetchedAt = 0;
let cachedOptionKey = '';

export interface ThreadsInsightsDataOptions {
  startDate?: string;
  endDate?: string;
}

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

export async function getThreadsInsightsData(options: ThreadsInsightsDataOptions = {}): Promise<ThreadsInsightsActivity> {
  const now = Date.now();
  const optionKey = JSON.stringify({
    startDate: options.startDate ?? null,
    endDate: options.endDate ?? null,
  });
  if (cachedActivity && now - cachedFetchedAt < CACHE_TTL_MS && cachedOptionKey === optionKey) {
    return cachedActivity;
  }

  let posts: PostInsight[] = [];
  try {
    const queryConditions: string[] = [
      'post_id IS NOT NULL',
      "post_id != ''",
    ];
    const params: Record<string, unknown> = {};
    if (options.startDate) {
      queryConditions.push('DATE(posted_at) >= @startDate');
      params.startDate = options.startDate;
    }
    if (options.endDate) {
      queryConditions.push('DATE(posted_at) <= @endDate');
      params.endDate = options.endDate;
    }

    // 常に件数制限をかける（期間指定時も無制限にしない）
    const limitClause = 'LIMIT @limit';
    params.limit = POSTS_LIMIT;

    const query = `
      SELECT
        post_id,
        posted_at,
        updated_at,
        content,
        impressions_total,
        likes_total
      FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
      WHERE ${queryConditions.join(' AND ')}
      ORDER BY posted_at DESC NULLS LAST, updated_at DESC NULLS LAST
      ${limitClause}
    `;

    const [rows] = await client.query({
      query,
      params,
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
          mainText: toPlain(row.content ?? ''),
          comments: [],
          commentData: [],
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

  // コメントデータを取得して投稿に紐付ける
  try {
    const postIds = posts.map((p) => p.postedThreadId);
    if (postIds.length > 0) {
      const [commentRows] = await client.query({
        query: `
          SELECT
            comment_id,
            parent_post_id,
            text,
            timestamp,
            depth,
            views
          FROM \`${PROJECT_ID}.${DATASET}.threads_comments\`
          WHERE parent_post_id IN UNNEST(@postIds)
          ORDER BY parent_post_id, depth ASC
        `,
        params: { postIds },
      });

      // 投稿IDごとにコメントをグループ化
      const commentsByPostId = new Map<string, PostComment[]>();
      for (const row of commentRows as Record<string, unknown>[]) {
        const parentPostId = toPlain(row.parent_post_id);
        if (!parentPostId) continue;

        const comment: PostComment = {
          commentId: toPlain(row.comment_id),
          parentPostId,
          text: toPlain(row.text),
          timestamp: normalizeTimestamp(row.timestamp),
          depth: Number(row.depth ?? 0),
          views: Number(row.views ?? 0),
        };

        if (!commentsByPostId.has(parentPostId)) {
          commentsByPostId.set(parentPostId, []);
        }
        commentsByPostId.get(parentPostId)!.push(comment);
      }

      // 各投稿にコメントデータを紐付け
      for (const post of posts) {
        const postComments = commentsByPostId.get(post.postedThreadId) || [];
        post.commentData = postComments.sort((a, b) => a.depth - b.depth);
      }
    }
  } catch (error) {
    // threads_commentsテーブルが存在しない場合はスキップ
    console.warn('[threadsInsightsData] threads_comments table not found or query failed', error);
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
  cachedOptionKey = optionKey;
  return cachedActivity;
}

/**
 * 日別の投稿数・インプレッション集計を取得（軽量クエリ）
 * content（本文）を取得しないため、約44倍効率的
 */
export async function getDailyPostStats(options: ThreadsInsightsDataOptions = {}): Promise<DailyPostStats[]> {
  try {
    const queryConditions: string[] = [
      'post_id IS NOT NULL',
      "post_id != ''",
    ];
    const params: Record<string, unknown> = {};
    if (options.startDate) {
      queryConditions.push('DATE(posted_at) >= @startDate');
      params.startDate = options.startDate;
    }
    if (options.endDate) {
      queryConditions.push('DATE(posted_at) <= @endDate');
      params.endDate = options.endDate;
    }

    const query = `
      SELECT
        DATE(posted_at) as date,
        COUNT(*) as post_count,
        SUM(COALESCE(impressions_total, 0)) as impressions,
        SUM(COALESCE(likes_total, 0)) as likes
      FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
      WHERE ${queryConditions.join(' AND ')}
      GROUP BY DATE(posted_at)
      ORDER BY date DESC
    `;

    const [rows] = await client.query({
      query,
      params,
    });

    return rows
      .map((row: Record<string, unknown>): DailyPostStats | null => {
        const dateString = toPlain(row.date);
        if (!dateString) return null;
        return {
          date: toDateOnly(dateString),
          postCount: Number(row.post_count ?? 0) || 0,
          impressions: Number(row.impressions ?? 0) || 0,
          likes: Number(row.likes ?? 0) || 0,
        };
      })
      .filter((item): item is DailyPostStats => item !== null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (error) {
    console.error('[threadsInsightsData] Failed to get daily post stats', error);
    return [];
  }
}
