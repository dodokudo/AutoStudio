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
    jobId: string;
    planId: string;
    status: string;
    postedThreadId?: string;
    errorMessage?: string;
    postedAt?: string;
  }>;
}

const client: BigQuery = createBigQueryClient(PROJECT_ID);

export async function getThreadsDashboard(): Promise<ThreadsDashboardData> {
  const [countsRows] = await client.query({
    query: `
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status = 'succeeded' AND DATE(updated_at) = CURRENT_DATE() THEN 1 ELSE 0 END) AS succeeded_today
      FROM \`${PROJECT_ID}.${DATASET}.thread_post_jobs\`
    `,
  });

  const jobCountsRow = countsRows[0] ?? {};

  const [logsRows] = await client.query({
    query: `
      SELECT
        job_id,
        plan_id,
        status,
        posted_thread_id,
        error_message,
        posted_at
      FROM \`${PROJECT_ID}.${DATASET}.thread_posting_logs\`
      ORDER BY posted_at DESC
      LIMIT 10
    `,
  });

  return {
    jobCounts: {
      pending: Number(jobCountsRow.pending ?? 0),
      processing: Number(jobCountsRow.processing ?? 0),
      failed: Number(jobCountsRow.failed ?? 0),
      succeededToday: Number(jobCountsRow.succeeded_today ?? 0),
    },
    recentLogs: logsRows.map((row) => ({
      jobId: row.job_id ? String(row.job_id) : '',
      planId: row.plan_id ? String(row.plan_id) : '',
      status: row.status ? String(row.status) : '',
      postedThreadId: row.posted_thread_id ? String(row.posted_thread_id) : undefined,
      errorMessage: row.error_message ? String(row.error_message) : undefined,
      postedAt: row.posted_at ? String(row.posted_at) : undefined,
    })),
  };
}
