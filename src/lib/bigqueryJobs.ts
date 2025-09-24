import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient } from './bigquery';
import type { ThreadPlan } from '@/types/threadPlan';

const DATASET = 'autostudio_threads';
const PROJECT_ID = process.env.BQ_PROJECT_ID ?? 'mark-454114';
const JOB_TABLE = 'thread_post_jobs';
const LOG_TABLE = 'thread_posting_logs';

const JOB_TABLE_SCHEMA = [
  { name: 'job_id', type: 'STRING' },
  { name: 'plan_id', type: 'STRING' },
  { name: 'scheduled_time', type: 'TIMESTAMP' },
  { name: 'status', type: 'STRING' },
  { name: 'attempt_count', type: 'INT64' },
  { name: 'error_message', type: 'STRING' },
  { name: 'payload', type: 'STRING' },
  { name: 'created_at', type: 'TIMESTAMP' },
  { name: 'updated_at', type: 'TIMESTAMP' },
];

const LOG_TABLE_SCHEMA = [
  { name: 'log_id', type: 'STRING' },
  { name: 'job_id', type: 'STRING' },
  { name: 'plan_id', type: 'STRING' },
  { name: 'status', type: 'STRING' },
  { name: 'posted_thread_id', type: 'STRING' },
  { name: 'error_message', type: 'STRING' },
  { name: 'posted_at', type: 'TIMESTAMP' },
  { name: 'created_at', type: 'TIMESTAMP' },
];

export type JobStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

export interface ThreadPostJob {
  job_id: string;
  plan_id: string;
  scheduled_time: string;
  status: JobStatus;
  attempt_count: number;
  error_message: string;
  payload: string;
  created_at: string;
  updated_at: string;
}

const client: BigQuery = createBigQueryClient(PROJECT_ID);

async function query<T = Record<string, unknown>>(sql: string, params?: Record<string, unknown>) {
  const [rows] = await client.query({ query: sql, params });
  return rows as T[];
}

async function ensureTables() {
  const dataset = client.dataset(DATASET);
  const jobTable = dataset.table(JOB_TABLE);
  const logTable = dataset.table(LOG_TABLE);
  const [jobExists] = await jobTable.exists();
  if (!jobExists) {
    try {
      await dataset.createTable(JOB_TABLE, { schema: JOB_TABLE_SCHEMA });
    } catch (error) {
      const message = (error as Error)?.message || '';
      if (!message.includes('Already Exists')) {
        throw error;
      }
    }
  }
  const [logExists] = await logTable.exists();
  if (!logExists) {
    try {
      await dataset.createTable(LOG_TABLE, { schema: LOG_TABLE_SCHEMA });
    } catch (error) {
      const message = (error as Error)?.message || '';
      if (!message.includes('Already Exists')) {
        throw error;
      }
    }
  }
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

function normalizeJob(row: Record<string, unknown>): ThreadPostJob {
  return {
    job_id: toPlain(row.job_id),
    plan_id: toPlain(row.plan_id),
    scheduled_time: toPlain(row.scheduled_time),
    status: (row.status ?? 'pending') as JobStatus,
    attempt_count: Number(row.attempt_count ?? 0),
    error_message: toPlain(row.error_message),
    payload: toPlain(row.payload),
    created_at: toPlain(row.created_at) || new Date().toISOString(),
    updated_at: toPlain(row.updated_at) || new Date().toISOString(),
  };
}

export async function createJobForPlan(plan: ThreadPlan) {
  await ensureTables();
  const jobId = `${plan.plan_id}-${Date.now()}`;
  const payload = JSON.stringify({
    mainText: plan.main_text,
    comments: (() => {
      try {
        const parsed = JSON.parse(plan.comments ?? '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    })(),
  });
  const scheduledTimeIso = new Date(`${plan.generation_date}T${plan.scheduled_time}:00+09:00`).toISOString();

  const sql = `
    INSERT \`${PROJECT_ID}.${DATASET}.${JOB_TABLE}\`
    (job_id, plan_id, scheduled_time, status, attempt_count, error_message, payload, created_at, updated_at)
    VALUES (@jobId, @planId, @scheduledTime, 'pending', 0, '', @payload, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
  `;
  await client.query({
    query: sql,
    params: {
      jobId,
      planId: plan.plan_id,
      scheduledTime: scheduledTimeIso,
      payload,
    },
  });
  const [job] = await query(
    `SELECT * FROM \`${PROJECT_ID}.${DATASET}.${JOB_TABLE}\` WHERE job_id = @jobId`,
    { jobId },
  );
  return job ? normalizeJob(job) : undefined;
}

export async function findJobByPlan(planId: string) {
  await ensureTables();
  const rows = await query(
    `SELECT * FROM \`${PROJECT_ID}.${DATASET}.${JOB_TABLE}\` WHERE plan_id = @planId AND status IN ('pending','processing','failed') ORDER BY updated_at DESC LIMIT 1`,
    { planId },
  );
  return rows.length ? normalizeJob(rows[0]) : undefined;
}

export async function fetchNextPendingJob() {
  await ensureTables();
  const rows = await query(
    `SELECT * FROM \`${PROJECT_ID}.${DATASET}.${JOB_TABLE}\`
     WHERE status = 'pending' AND scheduled_time <= CURRENT_TIMESTAMP()
     ORDER BY scheduled_time ASC
     LIMIT 1`,
  );
  return rows.length ? normalizeJob(rows[0]) : undefined;
}

export async function markJobProcessing(jobId: string) {
  await ensureTables();
  await client.query({
    query: `
      UPDATE \`${PROJECT_ID}.${DATASET}.${JOB_TABLE}\`
      SET status = 'processing', attempt_count = attempt_count + 1, updated_at = CURRENT_TIMESTAMP()
      WHERE job_id = @jobId
    `,
    params: { jobId },
  });
}

export async function markJobResult(jobId: string, status: JobStatus, options: { errorMessage?: string; postedThreadId?: string } = {}) {
  await ensureTables();
  await client.query({
    query: `
      UPDATE \`${PROJECT_ID}.${DATASET}.${JOB_TABLE}\`
      SET status = @status,
          error_message = COALESCE(@errorMessage, ''),
          updated_at = CURRENT_TIMESTAMP()
      WHERE job_id = @jobId
    `,
    params: {
      jobId,
      status,
      errorMessage: options.errorMessage ?? '',
    },
  });

  await client.query({
    query: `
      INSERT \`${PROJECT_ID}.${DATASET}.${LOG_TABLE}\`
      (log_id, job_id, plan_id, status, posted_thread_id, error_message, posted_at, created_at)
      SELECT
        GENERATE_UUID(),
        job_id,
        plan_id,
        @status,
        @postedThreadId,
        @errorMessage,
        CURRENT_TIMESTAMP(),
        CURRENT_TIMESTAMP()
      FROM \`${PROJECT_ID}.${DATASET}.${JOB_TABLE}\`
      WHERE job_id = @jobId
    `,
    params: {
      jobId,
      status,
      postedThreadId: options.postedThreadId ?? '',
      errorMessage: options.errorMessage ?? '',
    },
  });
}
