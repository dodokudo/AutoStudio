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
  const today = new Date().toISOString().slice(0, 10);
  const sql = `
    SELECT *
    FROM \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\`
    WHERE generation_date = CURRENT_DATE("Asia/Tokyo")
    ORDER BY scheduled_time
  `;

  console.log('[listPlans] Querying with SQL:', sql);
  console.log('[listPlans] Current date for comparison:', today);

  const rows = await query(sql);
  console.log('[listPlans] Raw query result:', {
    rowCount: rows.length,
    sampleRow: rows[0] || null
  });

  const plans = rows.map(normalizePlan);
  console.log('[listPlans] Normalized plans:', {
    planCount: plans.length,
    planIds: plans.map(p => p.plan_id)
  });

  return plans;
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
  console.log('[replaceTodayPlans] Starting with', {
    plansCount: plans.length,
    fallbackScheduleLength: fallbackSchedule.length
  });

  await ensurePlanTable();

  if (!plans.length) {
    console.log('[replaceTodayPlans] No plans provided, returning empty array');
    return [] as ThreadPlan[];
  }

  const today = new Date().toISOString().slice(0, 10);
  console.log('[replaceTodayPlans] Today date:', today);

  // 各プランをMERGE文でupsert
  for (const [index, plan] of plans.entries()) {
    const params = {
      planId: plan.planId,
      generationDate: today,
      scheduledTime: plan.scheduledTime ?? fallbackSchedule[index] ?? '07:00',
      templateId: plan.templateId ?? 'auto-generated',
      theme: plan.theme ?? '未分類',
      status: plan.status ?? 'draft',
      mainText: plan.mainText ?? '',
      comments: JSON.stringify(plan.comments ?? []),
    };

    console.log(`[replaceTodayPlans] Upserting plan ${index + 1}/${plans.length}:`, {
      planId: params.planId,
      generationDate: params.generationDate,
      scheduledTime: params.scheduledTime,
      mainTextLength: params.mainText.length,
      commentsLength: params.comments.length
    });

    const sql = `
      MERGE \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\` T
      USING (SELECT @planId AS plan_id, DATE(@generationDate) AS generation_date) S
      ON T.plan_id = S.plan_id AND T.generation_date = S.generation_date
      WHEN MATCHED THEN
        UPDATE SET
          scheduled_time = @scheduledTime,
          template_id = @templateId,
          theme = @theme,
          status = @status,
          main_text = @mainText,
          comments = @comments,
          updated_at = CURRENT_TIMESTAMP()
      WHEN NOT MATCHED THEN
        INSERT (plan_id, generation_date, scheduled_time, template_id, theme, status, main_text, comments, created_at, updated_at)
        VALUES (@planId, DATE(@generationDate), @scheduledTime, @templateId, @theme, @status, @mainText, @comments, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
    `;

    try {
      const [job] = await client.query({ query: sql, params });
      console.log(`[replaceTodayPlans] Plan ${index + 1} upsert result:`, {
        jobId: (job as { id?: string }).id,
        numRowsAffected: (job as { metadata?: { numDmlAffectedRows?: string } }).metadata?.numDmlAffectedRows || 'unknown'
      });
    } catch (error) {
      console.error(`[replaceTodayPlans] Error upserting plan ${index + 1}:`, error);
      throw error;
    }
  }

  console.log('[replaceTodayPlans] All plans upserted, retrieving results...');
  const result = await listPlans();
  console.log('[replaceTodayPlans] Retrieved plans count:', result.length);
  return result;
}

export async function seedPlansIfNeeded() {
  console.log('[bigqueryPlans] Checking if seeding is needed...');
  const existing = await listPlans();
  console.log('[bigqueryPlans] Existing plans count:', existing.length);

  if (existing.length > 0) {
    console.log('[bigqueryPlans] Plans already exist, returning existing plans');
    return existing;
  }

  console.log('[bigqueryPlans] No existing plans found, starting seeding process...');
  const insights = await getThreadsInsights(PROJECT_ID);
  const schedule = buildScheduleSlots(insights.meta.targetPostCount);
  const now = new Date().toISOString();

  console.log('[bigqueryPlans] Seeding insights:', {
    targetPostCount: insights.meta.targetPostCount,
    curatedPostsCount: insights.curatedSelfPosts.length,
    topPostsCount: insights.topSelfPosts.length,
    enforcedTheme: insights.writingChecklist.enforcedTheme
  });

  const sourcePosts = insights.curatedSelfPosts.length
    ? insights.curatedSelfPosts
    : insights.topSelfPosts.map((post) => ({
        postId: post.postId,
        impressions: post.impressions,
        likes: post.likes,
        mainPost: post.content,
        comments: [],
        permalink: post.permalink,
      }));

  const rows = sourcePosts.slice(0, insights.meta.targetPostCount).map((post, index) => ({
    plan_id: post.postId || `seed-${index + 1}`,
    generation_date: new Date().toISOString().slice(0, 10),
    scheduled_time: schedule[index] ?? '07:00',
    template_id: 'auto-generated',
    theme: insights.writingChecklist.enforcedTheme,
    status: (index === 0 ? 'draft' : index === 1 ? 'approved' : 'scheduled') as PlanStatus,
    main_text: (post as { mainPost?: string }).mainPost?.slice(0, 280) ?? (post as { main_text?: string }).main_text ?? '',
    comments: JSON.stringify(
      ('comments' in post && Array.isArray(post.comments)
        ? post.comments
        : []
      ).map((text, commentIndex) => ({ order: commentIndex + 1, text })),
    ),
    created_at: now,
    updated_at: now,
  }));

  if (rows.length === 0) {
    console.log('[bigqueryPlans] No source posts available, creating fallback plans');
    const fallbackCount = Math.max(1, insights.meta.targetPostCount || 3);
    for (let index = 0; index < fallbackCount; index += 1) {
      rows.push({
        plan_id: `seed-fallback-${index + 1}`,
        generation_date: new Date().toISOString().slice(0, 10),
        scheduled_time: schedule[index] ?? '07:00',
        template_id: 'auto-generated',
        theme: insights.writingChecklist.enforcedTheme,
        status: 'draft' as PlanStatus,
        main_text: 'AI活用の投稿案を準備中です。再作成ボタンで最新データを取得してください。',
        comments: JSON.stringify([]),
        created_at: now,
        updated_at: now,
      });
    }
  }

  console.log('[bigqueryPlans] Inserting seed plans:', {
    rowsCount: rows.length,
    planIds: rows.map(r => r.plan_id)
  });

  for (const [index, row] of rows.entries()) {
    console.log(`[bigqueryPlans] Inserting plan ${index + 1}/${rows.length}: ${row.plan_id}`);
    await client.query({
      query: `
        INSERT INTO \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\`
          (plan_id, generation_date, scheduled_time, template_id, theme, status, main_text, comments, created_at, updated_at)
        VALUES
          (@planId, DATE(@generationDate), @scheduledTime, @templateId, @theme, @status, @mainText, @comments, @createdAt, @updatedAt)
      `,
      params: {
        planId: row.plan_id,
        generationDate: row.generation_date,
        scheduledTime: row.scheduled_time,
        templateId: row.template_id,
        theme: row.theme,
        status: row.status,
        mainText: row.main_text,
        comments: row.comments,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  }

  console.log('[bigqueryPlans] Seeding completed, retrieving final plans...');
  const finalPlans = await listPlans();
  console.log('[bigqueryPlans] Final seeded plans count:', finalPlans.length);
  return finalPlans;
}

export async function listPlanSummaries(): Promise<ThreadPlanSummary[]> {
  await ensurePlanTable();
  const sql = `
    WITH plans AS (
      SELECT *
      FROM \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\`
      WHERE generation_date = CURRENT_DATE("Asia/Tokyo")
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
    WHERE plan_id = @planId AND generation_date = CURRENT_DATE("Asia/Tokyo")
  `;
  await client.query({ query: sql, params: { planId, status } });
  const [plan] = await query(
    `SELECT * FROM \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\` WHERE plan_id = @planId AND generation_date = CURRENT_DATE("Asia/Tokyo")`,
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
    ON T.plan_id = S.plan_id AND T.generation_date = CURRENT_DATE("Asia/Tokyo")
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
      VALUES (@planId, CURRENT_DATE("Asia/Tokyo"), COALESCE(@scheduledTime, '07:00'), COALESCE(@templateId, 'auto-generated'), COALESCE(@theme, '未分類'), COALESCE(@status, 'draft'), COALESCE(@mainText, ''), COALESCE(@comments, '[]'), CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
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
    `SELECT * FROM \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\` WHERE plan_id = @planId AND generation_date = CURRENT_DATE("Asia/Tokyo")`,
    { planId: plan.plan_id },
  );
  return updated ? normalizePlan(updated) : undefined;
}
