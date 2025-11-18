import { NextRequest, NextResponse } from 'next/server';
import { postThread } from '@/lib/threadsApi';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';
const PLAN_TABLE = 'thread_post_plans';
const LOG_TABLE = 'thread_posting_logs';

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

const COMMENT_SCHEDULE_TABLE = 'comment_schedules';
const COMMENT_SCHEDULE_SCHEMA = [
  { name: 'schedule_id', type: 'STRING' },
  { name: 'plan_id', type: 'STRING' },
  { name: 'parent_thread_id', type: 'STRING' },
  { name: 'comment_order', type: 'INTEGER' },
  { name: 'comment_text', type: 'STRING' },
  { name: 'scheduled_time', type: 'TIMESTAMP' },
  { name: 'status', type: 'STRING' },
  { name: 'posted_thread_id', type: 'STRING' },
  { name: 'error_message', type: 'STRING' },
  { name: 'executed_at', type: 'TIMESTAMP' },
  { name: 'created_at', type: 'TIMESTAMP' },
];

// テキストからURLを検出して分離する
function extractUrlFromText(text: string): { textWithoutUrl: string; url: string | undefined } {
  const urlPattern = /https?:\/\/[^\s]+/g;
  const urls = text.match(urlPattern);

  if (urls && urls.length > 0) {
    const url = urls[0];
    const textWithoutUrl = text.replace(url, '').trim();
    return { textWithoutUrl, url };
  }

  return { textWithoutUrl: text, url: undefined };
}

async function ensureLogTable() {
  const client = createBigQueryClient(PROJECT_ID);
  const dataset = client.dataset(DATASET);
  const logTable = dataset.table(LOG_TABLE);
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

async function ensureCommentScheduleTable() {
  const client = createBigQueryClient(PROJECT_ID);
  const dataset = client.dataset(DATASET);
  const scheduleTable = dataset.table(COMMENT_SCHEDULE_TABLE);
  const [scheduleExists] = await scheduleTable.exists();
  if (!scheduleExists) {
    try {
      await dataset.createTable(COMMENT_SCHEDULE_TABLE, { schema: COMMENT_SCHEDULE_SCHEMA });
    } catch (error) {
      const message = (error as Error)?.message || '';
      if (!message.includes('Already Exists')) {
        throw error;
      }
    }
  }
}

interface PublishRequest {
  plan_id: string;
}

function validateTextLength(mainText?: string, comments?: { text: string }[]): string | null {
  if (mainText && mainText.length > 500) {
    return 'メイン投稿は500文字以内である必要があります';
  }

  if (comments && Array.isArray(comments)) {
    for (let i = 0; i < comments.length; i++) {
      if (comments[i]?.text && comments[i].text.length > 500) {
        return `コメント${i + 1}は500文字以内である必要があります`;
      }
    }
  }

  return null;
}

async function scheduleComments(planId: string, mainThreadId: string, comments: { order: number; text: string }[]) {
  for (let i = 0; i < comments.length; i++) {
    const comment = comments[i];
    const delayMinutes = (i + 1) * 2; // 2分, 4分, 6分...の間隔

    // BigQueryにコメント投稿スケジュールを保存
    const client = createBigQueryClient(PROJECT_ID);
    const scheduleId = `schedule-${planId}-${comment.order}-${Date.now()}`;
    const scheduledTime = new Date(Date.now() + delayMinutes * 60 * 1000);

    const insertScheduleQuery = `
      INSERT INTO \`${PROJECT_ID}.${DATASET}.comment_schedules\`
      (schedule_id, plan_id, parent_thread_id, comment_order, comment_text, scheduled_time, status, created_at)
      VALUES (@schedule_id, @plan_id, @parent_thread_id, @comment_order, @comment_text, @scheduled_time, @status, CURRENT_TIMESTAMP())
    `;

    await client.query({
      query: insertScheduleQuery,
      params: {
        schedule_id: scheduleId,
        plan_id: planId,
        parent_thread_id: mainThreadId,
        comment_order: comment.order,
        comment_text: comment.text,
        scheduled_time: scheduledTime.toISOString(),
        status: 'pending'
      }
    });

    console.log(`[threads/publish] Scheduled comment ${comment.order} for ${delayMinutes} minutes later (${scheduledTime.toISOString()})`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as PublishRequest;
    const { plan_id } = body;

    if (!plan_id) {
      return NextResponse.json({ error: 'plan_id is required' }, { status: 400 });
    }

    console.log(`[threads/publish] Starting publish for plan: ${plan_id}`);

    const client = createBigQueryClient(PROJECT_ID);
    await ensureLogTable();
    await ensureCommentScheduleTable();

    // Get the plan from BigQuery
    const getPlanQuery = `
      SELECT plan_id, main_text, comments, status
      FROM \`${PROJECT_ID}.${DATASET}.${PLAN_TABLE}\`
      WHERE plan_id = @plan_id AND generation_date = CURRENT_DATE("Asia/Tokyo")
    `;

    const [planRows] = await client.query({
      query: getPlanQuery,
      params: { plan_id }
    });

    if (!planRows.length) {
      console.error(`[threads/publish] Plan not found: ${plan_id}`);
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const plan = planRows[0];
    console.log(`[threads/publish] Found plan:`, {
      plan_id: plan.plan_id,
      status: plan.status,
      main_text_length: plan.main_text?.length || 0,
      comments: plan.comments
    });

    // Parse comments
    let comments: { order: number; text: string }[] = [];
    try {
      comments = JSON.parse(plan.comments || '[]');
    } catch (error) {
      console.warn(`[threads/publish] Failed to parse comments for plan ${plan_id}:`, error);
    }

    // 文字数バリデーション
    const validationError = validateTextLength(plan.main_text, comments);
    if (validationError) {
      console.error(`[threads/publish] Validation error for plan ${plan_id}:`, validationError);
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    // Post main thread
    console.log(`[threads/publish] Posting main thread...`);
    const { textWithoutUrl, url } = extractUrlFromText(plan.main_text);
    console.log(`[threads/publish] Text: "${textWithoutUrl.substring(0, 50)}...", URL: ${url || 'none'}`);
    const mainThreadId = await postThread(textWithoutUrl, undefined, url);
    console.log(`[threads/publish] Main thread posted with ID: ${mainThreadId}`);

    // Schedule comments for delayed posting
    const commentResults: { order: number; thread_id: string }[] = [];
    if (comments.length > 0) {
      console.log(`[threads/publish] Scheduling ${comments.length} comments for delayed posting...`);
      await scheduleComments(plan_id, mainThreadId, comments);
    }

    // Create log entry
    const logId = `log-${plan_id}-${Date.now()}`;
    const insertLogQuery = `
      INSERT INTO \`${PROJECT_ID}.${DATASET}.${LOG_TABLE}\`
      (log_id, plan_id, status, posted_thread_id, posted_at, created_at)
      VALUES (@log_id, @plan_id, @status, @posted_thread_id, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP())
    `;

    await client.query({
      query: insertLogQuery,
      params: {
        log_id: logId,
        plan_id: plan_id,
        status: 'success',
        posted_thread_id: mainThreadId
      }
    });

    console.log(`[threads/publish] Successfully published plan ${plan_id} with main thread ${mainThreadId} and ${commentResults.length} comments`);

    return NextResponse.json({
      success: true,
      plan_id,
      main_thread_id: mainThreadId,
      comment_results: commentResults,
      log_id: logId
    });

  } catch (error) {
    console.error('[threads/publish] Error:', error);

    // Try to log the error if we have the plan_id
    try {
      const body = await request.clone().json() as PublishRequest;
      if (body.plan_id) {
        const client = createBigQueryClient(PROJECT_ID);
        const logId = `log-${body.plan_id}-${Date.now()}-error`;
        const insertErrorLogQuery = `
          INSERT INTO \`${PROJECT_ID}.${DATASET}.${LOG_TABLE}\`
          (log_id, plan_id, status, error_message, created_at)
          VALUES (@log_id, @plan_id, @status, @error_message, CURRENT_TIMESTAMP())
        `;

        await client.query({
          query: insertErrorLogQuery,
          params: {
            log_id: logId,
            plan_id: body.plan_id,
            status: 'failed',
            error_message: (error as Error).message
          }
        });
      }
    } catch (logError) {
      console.error('[threads/publish] Failed to log error:', logError);
    }

    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
