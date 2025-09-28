import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient, resolveProjectId } from './bigquery';
import { getThreadInsights, type ThreadInsights } from './threadsApi';

const DATASET = 'autostudio_threads';
const PROJECT_ID = resolveProjectId();

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

const client: BigQuery = createBigQueryClient(PROJECT_ID);

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

function parseComments(value: unknown): string[] {
  if (!value) return [];
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (Array.isArray(parsed)) {
      return parsed.map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) {
          return String((item as { text?: unknown }).text ?? '');
        }
        return String(item ?? '');
      });
    }
  } catch (error) {
    console.warn('[threadsInsightsData] Failed to parse comments', value, error);
  }
  return [];
}

async function appendThreadInsights(
  target: PostInsight[],
  row: Record<string, unknown>,
  source: 'logs' | 'fallback',
  seen: Map<string, { impressions?: number; likes?: number }>,
) {
  const postedThreadId = toPlain(row.posted_thread_id ?? row.post_id ?? '');
  if (!postedThreadId) return;

  const existing = seen.get(postedThreadId);
  const impressions = Number(row.impressions_total ?? row.views ?? row.impressions ?? existing?.impressions ?? 0) || 0;
  const likes = Number(row.likes_total ?? row.likes ?? existing?.likes ?? 0) || 0;

  if (existing) {
    existing.impressions = Math.max(existing.impressions ?? 0, impressions);
    existing.likes = Math.max(existing.likes ?? 0, likes);
    return;
  }

  const postedAtIso = normalizeTimestamp(row.posted_at ?? row.created_at ?? '');
  const postedAt = postedAtIso || new Date().toISOString();

  const insightRecord: PostInsight = {
    planId: toPlain(row.plan_id) || `post-${postedThreadId}`,
    postedThreadId,
    postedAt,
    templateId: toPlain(row.template_id) || 'auto-generated',
    theme: toPlain(row.theme) || '未分類',
    mainText: toPlain(row.main_text ?? row.content ?? ''),
    comments: parseComments(row.comments),
    insights: { impressions, likes },
  };

  if (!insightRecord.insights.impressions || !insightRecord.insights.likes) {
    try {
      const api = await getThreadInsights(postedThreadId);
      insightRecord.insights = {
        impressions: api.impressions ?? insightRecord.insights.impressions,
        likes: api.likes ?? insightRecord.insights.likes,
        replies: api.replies,
        reposts: api.reposts,
        quotes: api.quotes,
      };
    } catch (error) {
      console.warn(`[threadsInsightsData] Failed to get API insights for ${postedThreadId} (${source})`, error);
    }
  }

  seen.set(postedThreadId, {
    impressions: insightRecord.insights.impressions,
    likes: insightRecord.insights.likes,
  });

  target.push(insightRecord);
}

export async function getThreadsInsightsData(): Promise<PostInsight[]> {
  console.log('[threadsInsightsData] Fetching insights data from BigQuery...');

  const results: PostInsight[] = [];
  const seenThreads = new Map<string, { impressions?: number; likes?: number }>();

  try {
    const [rows] = await client.query({
      query: `
        SELECT
          l.plan_id,
          l.posted_thread_id,
          l.posted_at,
          p.template_id,
          p.theme,
          p.main_text,
          p.comments,
          tp.impressions_total,
          tp.likes_total
        FROM \`${PROJECT_ID}.${DATASET}.thread_posting_logs\` l
        JOIN \`${PROJECT_ID}.${DATASET}.thread_post_plans\` p
          ON l.plan_id = p.plan_id
        LEFT JOIN \`${PROJECT_ID}.${DATASET}.threads_posts\` tp
          ON tp.post_id = l.posted_thread_id
        WHERE l.posted_thread_id IS NOT NULL
          AND l.posted_thread_id != ''
          AND l.posted_thread_id NOT LIKE 'dryrun-%'
        ORDER BY l.posted_at DESC
        LIMIT 200
      `,
    });

    console.log('[threadsInsightsData] Logs query row count:', rows.length);
    for (const row of rows) {
      await appendThreadInsights(results, row, 'logs', seenThreads);
    }
  } catch (error) {
    console.error('[threadsInsightsData] Failed to read posting logs', error);
  }

  if (!results.length) {
    console.log('[threadsInsightsData] Falling back to threads_posts only dataset');
    try {
      const [fallbackRows] = await client.query({
        query: `
          SELECT
            post_id,
            posted_at,
            content,
            impressions_total,
            likes_total
          FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
          WHERE post_id IS NOT NULL AND post_id != ''
          ORDER BY posted_at DESC
          LIMIT 200
        `,
      });

      for (const row of fallbackRows) {
        await appendThreadInsights(results, row, 'fallback', seenThreads);
      }
    } catch (error) {
      console.error('[threadsInsightsData] Fallback threads_posts query failed', error);
    }
  }

  results.sort((a, b) => {
    const aTime = new Date(a.postedAt).getTime();
    const bTime = new Date(b.postedAt).getTime();
    if (Number.isNaN(aTime) && Number.isNaN(bTime)) return 0;
    if (Number.isNaN(aTime)) return 1;
    if (Number.isNaN(bTime)) return -1;
    return bTime - aTime;
  });

  console.log('[threadsInsightsData] Final insights count:', results.length);
  console.log('[threadsInsightsData] Sample:', results.slice(0, 5).map((item) => ({
    planId: item.planId,
    postedThreadId: item.postedThreadId,
    postedAt: item.postedAt,
    impressions: item.insights.impressions,
    likes: item.insights.likes,
  })));
  return results;
}
