import { NextResponse } from 'next/server';
import { postThread } from '@/lib/threadsApi';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';

// テキストからURLを検出して分離する
function extractUrlFromText(text: string): { textWithoutUrl: string; url: string | undefined } {
  // URLの正規表現パターン
  const urlPattern = /https?:\/\/[^\s]+/g;
  const urls = text.match(urlPattern);

  if (urls && urls.length > 0) {
    // 最初のURLを link_attachment として使用
    const url = urls[0];
    // テキストからURLを削除し、余分な空白を整理
    const textWithoutUrl = text.replace(url, '').trim();
    return { textWithoutUrl, url };
  }

  return { textWithoutUrl: text, url: undefined };
}

export async function POST() {
  try {
    console.log('[threads/comments/execute] Starting scheduled comment execution...');

    const client = createBigQueryClient(PROJECT_ID);

    // 実行予定時刻を過ぎた未実行のコメントを取得
    const getPendingCommentsQuery = `
      SELECT schedule_id, plan_id, parent_thread_id, comment_order, comment_text, scheduled_time, status
      FROM \`${PROJECT_ID}.${DATASET}.comment_schedules\`
      WHERE (status = 'pending' OR (status = 'failed' AND TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), scheduled_time, MINUTE) >= 1))
        AND scheduled_time <= CURRENT_TIMESTAMP()
      ORDER BY scheduled_time ASC
      LIMIT 10
    `;

    const [pendingComments] = await client.query({
      query: getPendingCommentsQuery
    });

    if (!pendingComments.length) {
      console.log('[threads/comments/execute] No pending comments to execute');
      return NextResponse.json({
        success: true,
        message: 'No pending comments to execute',
        executed: 0
      });
    }

    console.log(`[threads/comments/execute] Found ${pendingComments.length} pending comments`);

    let executedCount = 0;

    for (const comment of pendingComments) {
      try {
        // コメント順序に応じて返信先を決定
        const replyToId = comment.comment_order === 1
          ? comment.parent_thread_id
          : await getLastCommentId(comment.plan_id, comment.comment_order - 1);

        if (!replyToId) {
          throw new Error(`Previous comment not found for order ${comment.comment_order}`);
        }

        console.log(`[threads/comments/execute] Posting comment ${comment.comment_order} (replyTo: ${replyToId})...`);

        // Threads APIの安定性のため、短い待機時間を追加
        await new Promise(resolve => setTimeout(resolve, 2000));

        // テキストからURLを検出して分離
        const { textWithoutUrl, url } = extractUrlFromText(comment.comment_text);

        console.log(`[threads/comments/execute] Text: "${textWithoutUrl}", URL: ${url || 'none'}`);

        const commentThreadId = await postThread(textWithoutUrl, replyToId, url);

        console.log(`[threads/comments/execute] Comment ${comment.comment_order} posted with ID: ${commentThreadId}`);

        // スケジュールステータスを更新
        const updateScheduleQuery = `
          UPDATE \`${PROJECT_ID}.${DATASET}.comment_schedules\`
          SET status = 'completed', posted_thread_id = @posted_thread_id, executed_at = CURRENT_TIMESTAMP()
          WHERE schedule_id = @schedule_id
        `;

        await client.query({
          query: updateScheduleQuery,
          params: {
            schedule_id: comment.schedule_id,
            posted_thread_id: commentThreadId
          }
        });

        executedCount++;

        // コメント間に1秒待機
        if (executedCount < pendingComments.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error) {
        console.error(`[threads/comments/execute] Failed to post comment ${comment.comment_order}:`, error);

        // エラーステータスを更新
        const updateErrorQuery = `
          UPDATE \`${PROJECT_ID}.${DATASET}.comment_schedules\`
          SET status = 'failed', error_message = @error_message, executed_at = CURRENT_TIMESTAMP()
          WHERE schedule_id = @schedule_id
        `;

        await client.query({
          query: updateErrorQuery,
          params: {
            schedule_id: comment.schedule_id,
            error_message: (error as Error).message
          }
        });
      }
    }

    console.log(`[threads/comments/execute] Execution completed. ${executedCount}/${pendingComments.length} comments posted successfully`);

    return NextResponse.json({
      success: true,
      executed: executedCount,
      total: pendingComments.length
    });

  } catch (error) {
    console.error('[threads/comments/execute] Error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

async function getLastCommentId(planId: string, orderNumber: number): Promise<string | null> {
  const client = createBigQueryClient(PROJECT_ID);

  const getCommentQuery = `
    SELECT posted_thread_id
    FROM \`${PROJECT_ID}.${DATASET}.comment_schedules\`
    WHERE plan_id = @plan_id
      AND comment_order = @comment_order
      AND status = 'completed'
  `;

  const [results] = await client.query({
    query: getCommentQuery,
    params: {
      plan_id: planId,
      comment_order: orderNumber
    }
  });

  return results.length > 0 ? results[0].posted_thread_id : null;
}