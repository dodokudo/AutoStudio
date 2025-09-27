import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient, resolveProjectId } from './bigquery';

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
  // Future: metrics will be added when we connect to Threads API for insights
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
      ORDER BY l.posted_at DESC
      LIMIT 50
    `,
  });

  return rows.map((row) => ({
    planId: String(row.plan_id),
    postedThreadId: String(row.posted_thread_id),
    postedAt: String(row.posted_at),
    templateId: String(row.template_id),
    theme: String(row.theme),
    mainText: String(row.main_text),
    comments: row.comments ? JSON.parse(String(row.comments)) : [],
  }));
}