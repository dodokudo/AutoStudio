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
    const mainThreadId = await postThread(plan.main_text);
    console.log(`[threads/publish] Main thread posted with ID: ${mainThreadId}`);

    // Post comments as replies
    const commentResults: { order: number; thread_id: string }[] = [];
    let lastThreadId = mainThreadId;

    for (const comment of comments.sort((a, b) => a.order - b.order)) {
      try {
        console.log(`[threads/publish] Posting comment ${comment.order}...`);
        const commentThreadId = await postThread(comment.text, lastThreadId);
        console.log(`[threads/publish] Comment ${comment.order} posted with ID: ${commentThreadId}`);

        commentResults.push({
          order: comment.order,
          thread_id: commentThreadId
        });

        lastThreadId = commentThreadId;
      } catch (error) {
        console.error(`[threads/publish] Failed to post comment ${comment.order}:`, error);
        // Continue with other comments even if one fails
      }
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
