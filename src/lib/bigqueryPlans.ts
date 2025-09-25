import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient, resolveProjectId } from './bigquery';
import { buildScheduleSlots } from './promptBuilder';
import { getThreadsInsights } from './threadsInsights';
import { createJobForPlan, findJobByPlan } from './bigqueryJobs';
import type { PlanStatus, ThreadPlan, ThreadPlanSummary } from '@/types/threadPlan';

const DATASET = 'autostudio_threads';
const PROJECT_ID = resolveProjectId();

const client: BigQuery = createBigQueryClient(PROJECT_ID);
const PLAN_TABLE = 'thread_post_plans';

const PLAN_TABLE_SCHEMA = [
  { name: 'plan_id', type: 'STRING' },
  { name: 'generation_date', type: 'DATE' },
  { name: 'scheduled_time', type: 'STRING' },
  { name: 'template_id', type: 'STRING' },
  { name: 'theme', type: 'STRING' },
  { name: 'status', type: 'STRING' },
  { name: 'main_text', type: 'STRING' },
  { name: 'comments', type: 'STRING' },
  { name: 'created_at', type: 'TIMESTAMP' },
  { name: 'updated_at', type: 'TIMESTAMP' },
];

async function query<T = Record<string, unknown>>(sql: string, params?: Record<string, unknown>): Promise<T[]> {
  const [rows] = await client.query({ query: sql, params });
  return rows as T[];
}

async function ensurePlanTable() {
  const dataset = client.dataset(DATASET);
  const table = dataset.table(PLAN_TABLE);
  const [exists] = await table.exists();
  if (!exists) {
    try {
      await dataset.createTable(PLAN_TABLE, {
        schema: PLAN_TABLE_SCHEMA,
      });
    } catch (error) {
      const message = (error as Error)?.message || '';
      if (!message.includes('Already Exists')) {
        console.error('Failed to create thread_post_plans table', error);
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

function normalizePlan(plan: Record<string, unknown>): ThreadPlan {
  return {
    plan_id: toPlain(plan.plan_id),
    generation_date: toPlain(plan.generation_date).slice(0, 10),
    scheduled_time: toPlain(plan.scheduled_time) || '07:00',
    template_id: toPlain(plan.template_id) || 'auto-generated',
    theme: toPlain(plan.theme) || '未分類',
    status: (plan.status ?? 'draft') as PlanStatus,
    main_text: toPlain(plan.main_text),
    comments: toPlain(plan.comments) || '[]',
    created_at: toPlain(plan.created_at) || new Date().toISOString(),
    updated_at: toPlain(plan.updated_at) || new Date().toISOString(),
  };
}

export async function listPlans(): Promise<ThreadPlan[]> {
  await ensurePlanTable();
  const sql = `
    SELECT *
    FROM \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\`
    WHERE generation_date = CURRENT_DATE()
    ORDER BY scheduled_time
  `;
  const rows = await query(sql);
  return rows.map(normalizePlan);
}

export interface GeneratedPlanInput {
  planId: string;
  scheduledTime?: string;
  templateId: string;
  theme: string;
  mainText: string;
  comments: { order: number; text: string }[];
  status?: PlanStatus;
}

export async function replaceTodayPlans(plans: GeneratedPlanInput[], fallbackSchedule: string[]) {
  await ensurePlanTable();

  const dataset = client.dataset(DATASET);
  await client.query({
    query: `DELETE FROM \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\` WHERE generation_date = CURRENT_DATE()`,
  });

  if (!plans.length) {
    return [] as ThreadPlan[];
  }

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const rows = plans.map((plan, index) => ({
    plan_id: plan.planId,
    generation_date: today,
    scheduled_time: plan.scheduledTime ?? fallbackSchedule[index] ?? '07:00',
    template_id: plan.templateId ?? 'auto-generated',
    theme: plan.theme ?? '未分類',
    status: plan.status ?? 'draft',
    main_text: plan.mainText ?? '',
    comments: JSON.stringify(plan.comments ?? []),
    created_at: now,
    updated_at: now,
  }));

  await dataset.table(PLAN_TABLE).insert(rows);
  return listPlans();
}

export async function seedPlansIfNeeded() {
  const existing = await listPlans();
  if (existing.length > 0) {
    return existing;
  }

  const insights = await getThreadsInsights(PROJECT_ID);
  const schedule = buildScheduleSlots(insights.meta.targetPostCount);
  const now = new Date().toISOString();

  const rows = insights.topSelfPosts.slice(0, 10).map((post, index) => ({
    plan_id: post.postId ?? `plan-${index + 1}`,
    generation_date: new Date().toISOString().slice(0, 10),
    scheduled_time: schedule[index] ?? '07:00',
    template_id: 'auto-generated',
    theme: insights.trendingTopics[index]?.themeTag ?? '未分類',
    status: (index === 0 ? 'draft' : index === 1 ? 'approved' : 'scheduled') as PlanStatus,
    main_text: post.content?.slice(0, 280) ?? '',
    comments: JSON.stringify([]),
    created_at: now,
    updated_at: now,
  }));

  const dataset = client.dataset(DATASET);
  await dataset.table(PLAN_TABLE).insert(rows);
  return listPlans();
}

export async function listPlanSummaries(): Promise<ThreadPlanSummary[]> {
  await ensurePlanTable();
  const sql = `
    WITH plans AS (
      SELECT *
      FROM \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\`
      WHERE generation_date = CURRENT_DATE()
    ),
    latest_jobs AS (
      SELECT
        plan_id,
        (
          ARRAY_AGG(
            STRUCT(
              job_id AS job_id,
              status AS job_status,
              updated_at AS job_updated_at,
              error_message AS job_error_message
            )
            ORDER BY updated_at DESC
          )
        )[SAFE_OFFSET(0)] AS job
      FROM \`${PROJECT_ID}.${DATASET}.thread_post_jobs\`
      WHERE job_id IS NOT NULL
      GROUP BY plan_id
    ),
    latest_logs AS (
      SELECT
        plan_id,
        (
          ARRAY_AGG(
            STRUCT(
              status AS log_status,
              posted_thread_id AS log_posted_thread_id,
              error_message AS log_error_message,
              posted_at AS log_posted_at
            )
            ORDER BY posted_at DESC
          )
        )[SAFE_OFFSET(0)] AS log
      FROM \`${PROJECT_ID}.${DATASET}.thread_posting_logs\`
      WHERE posted_at IS NOT NULL
      GROUP BY plan_id
    )
    SELECT
      p.plan_id,
      p.scheduled_time,
      p.status,
      p.template_id,
      p.theme,
      p.main_text,
      p.comments,
      job.job.job_status AS job_status,
      job.job.job_updated_at AS job_updated_at,
      job.job.job_error_message AS job_error_message,
      log.log.log_status AS log_status,
      log.log.log_error_message AS log_error_message,
      log.log.log_posted_thread_id AS log_posted_thread_id,
      log.log.log_posted_at AS log_posted_at
    FROM plans p
    LEFT JOIN latest_jobs job ON p.plan_id = job.plan_id
    LEFT JOIN latest_logs log ON p.plan_id = log.plan_id
    ORDER BY p.scheduled_time
  `;

  const rows = await query(sql);
  return rows.map((row) => ({
    plan_id: toPlain(row.plan_id),
    scheduled_time: toPlain(row.scheduled_time) || '07:00',
    status: (row.status ?? 'draft') as PlanStatus,
    template_id: toPlain(row.template_id) || 'auto-generated',
    theme: toPlain(row.theme) || '未分類',
    main_text: toPlain(row.main_text),
    comments: toPlain(row.comments) || '[]',
    job_status: row.job_status ? String(row.job_status) : undefined,
    job_updated_at: row.job_updated_at ? String(row.job_updated_at) : undefined,
    job_error_message: row.job_error_message ? String(row.job_error_message) : undefined,
    log_status: row.log_status ? String(row.log_status) : undefined,
    log_error_message: row.log_error_message ? String(row.log_error_message) : undefined,
    log_posted_thread_id: row.log_posted_thread_id ? String(row.log_posted_thread_id) : undefined,
    log_posted_at: row.log_posted_at ? String(row.log_posted_at) : undefined,
  }));
}

export async function updatePlanStatus(planId: string, status: PlanStatus) {
  await ensurePlanTable();
  const sql = `
    UPDATE \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\`
    SET status = @status, updated_at = CURRENT_TIMESTAMP()
    WHERE plan_id = @planId AND generation_date = CURRENT_DATE()
  `;
  await client.query({ query: sql, params: { planId, status } });
  const [plan] = await query(
    `SELECT * FROM \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\` WHERE plan_id = @planId AND generation_date = CURRENT_DATE()`,
    { planId },
  );
  const normalized = plan ? normalizePlan(plan) : undefined;

  if (normalized && status === 'approved') {
    const existingJob = await findJobByPlan(normalized.plan_id);
    if (!existingJob) {
      await createJobForPlan(normalized);
    }
  }

  return normalized;
}

export async function upsertPlan(plan: Partial<ThreadPlan> & { plan_id: string }) {
  await ensurePlanTable();
  const sql = `
    MERGE \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\` T
    USING (SELECT @planId AS plan_id) S
    ON T.plan_id = S.plan_id AND T.generation_date = CURRENT_DATE()
    WHEN MATCHED THEN
      UPDATE SET
        scheduled_time = COALESCE(@scheduledTime, T.scheduled_time),
        template_id = COALESCE(@templateId, T.template_id),
        theme = COALESCE(@theme, T.theme),
        status = COALESCE(@status, T.status),
        main_text = COALESCE(@mainText, T.main_text),
        comments = COALESCE(@comments, T.comments),
        updated_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN
      INSERT (plan_id, generation_date, scheduled_time, template_id, theme, status, main_text, comments, created_at, updated_at)
      VALUES (@planId, CURRENT_DATE(), COALESCE(@scheduledTime, '07:00'), COALESCE(@templateId, 'auto-generated'), COALESCE(@theme, '未分類'), COALESCE(@status, 'draft'), COALESCE(@mainText, ''), COALESCE(@comments, '[]'), CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
  `;

  await client.query({
    query: sql,
    params: {
      planId: plan.plan_id,
      scheduledTime: plan.scheduled_time,
      templateId: plan.template_id,
      theme: plan.theme,
      status: plan.status,
      mainText: plan.main_text,
      comments: plan.comments,
    },
  });

  const [updated] = await query(
    `SELECT * FROM \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\` WHERE plan_id = @planId AND generation_date = CURRENT_DATE()`,
    { planId: plan.plan_id },
  );
  return updated ? normalizePlan(updated) : undefined;
}
