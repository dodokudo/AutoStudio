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

export async function getThreadsInsightsData(): Promise<PostInsight[]> {
  const [rows] = await client.query({
    query: `
      SELECT
        l.plan_id,
        l.posted_thread_id,
        l.posted_at,
        p.template_id,
        p.theme,
        p.main_text,
        p.comments
      FROM \`${PROJECT_ID}.${DATASET}.thread_posting_logs\` l
      JOIN \`${PROJECT_ID}.${DATASET}.thread_post_plans\` p
        ON l.plan_id = p.plan_id
      WHERE l.status = 'success'
        AND l.posted_thread_id IS NOT NULL
        AND l.posted_thread_id != ''
        AND l.posted_thread_id NOT LIKE 'dryrun-%'
      ORDER BY l.posted_at DESC
      LIMIT 50
    `,
  });

  const results: PostInsight[] = [];

  for (const row of rows) {
    const postedThreadId = String(row.posted_thread_id);

    // Threads APIからインサイトを取得
    let insights: ThreadInsights = {};
    try {
      insights = await getThreadInsights(postedThreadId);
    } catch (error) {
      console.warn(`[threadsInsightsData] Failed to get insights for ${postedThreadId}:`, error);
    }

    results.push({
      planId: String(row.plan_id),
      postedThreadId,
      postedAt: String(row.posted_at),
      templateId: String(row.template_id),
      theme: String(row.theme),
      mainText: String(row.main_text),
      comments: row.comments ? JSON.parse(String(row.comments)) : [],
      insights,
    });
  }

  return results;
}