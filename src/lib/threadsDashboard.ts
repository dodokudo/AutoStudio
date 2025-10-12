import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient, resolveProjectId } from './bigquery';

const DATASET = 'autostudio_threads';
const PROJECT_ID = resolveProjectId();

export interface ThreadsDashboardData {
  jobCounts: {
    pending: number;
    processing: number;
    failed: number;
    succeededToday: number;
  };
  recentLogs: Array<{
    logId: string;
    jobId?: string;
    planId: string;
    status: string;
    postedThreadId?: string;
    errorMessage?: string;
    postedAt?: string;
    createdAt?: string;
    mainText?: string;
    templateId?: string;
    theme?: string;
    scheduledTime?: string;
  }>;
}

const client: BigQuery = createBigQueryClient(PROJECT_ID);

export async function getThreadsDashboard(): Promise<ThreadsDashboardData> {
  const [countsRows] = await client.query({
    query: `
      SELECT
        SUM(CASE WHEN status = 'success' AND DATE(posted_at) = CURRENT_DATE() THEN 1 ELSE 0 END) AS succeeded_today
      FROM \`${PROJECT_ID}.${DATASET}.thread_posting_logs\`
    `,
  });

  const jobCountsRow = countsRows[0] ?? {};

  const [logsRows] = await client.query({
    query: `
      SELECT
        l.log_id,
        l.job_id,
        l.plan_id,
        l.status,
        l.posted_thread_id,
        l.error_message,
        l.posted_at,
        l.created_at,
        p.main_text,
        p.template_id,
        p.theme,
        p.scheduled_time
      FROM \`${PROJECT_ID}.${DATASET}.thread_posting_logs\` l
      LEFT JOIN \`${PROJECT_ID}.${DATASET}.thread_post_plans\` p
        ON l.plan_id = p.plan_id
      ORDER BY l.created_at DESC
      LIMIT 50
    `,
  });

  return {
    jobCounts: {
      pending: 0, // TODO: 将来的にジョブテーブルが必要になったら再実装
      processing: 0,
      failed: 0,
      succeededToday: Number(jobCountsRow.succeeded_today ?? 0),
    },
    recentLogs: logsRows.map((row) => ({
      jobId: row.job_id ? String(row.job_id) : undefined,
      planId: row.plan_id ? String(row.plan_id) : '',
      status: row.status ? String(row.status) : '',
      logId: row.log_id ? String(row.log_id) : '',
      postedThreadId: row.posted_thread_id ? String(row.posted_thread_id) : undefined,
      errorMessage: row.error_message ? String(row.error_message) : undefined,
      postedAt: row.posted_at ? String(row.posted_at) : undefined,
      createdAt: row.created_at ? String(row.created_at) : undefined,
      mainText: row.main_text ? String(row.main_text) : undefined,
      templateId: row.template_id ? String(row.template_id) : undefined,
      theme: row.theme ? String(row.theme) : undefined,
      scheduledTime: row.scheduled_time ? String(row.scheduled_time) : undefined,
    })),
  };
}
