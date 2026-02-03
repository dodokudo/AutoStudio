import { postThread } from '@/lib/threadsApi';
import {
  listScheduledPosts,
  updateScheduledPost,
  type ScheduledPostRow,
} from '@/lib/bigqueryScheduledPosts';

/**
 * 日本時間で現在時刻を取得
 */
function getJstNow() {
  const now = new Date();
  // JSTのオフセット（+9時間）を適用
  const jstOffset = 9 * 60 * 60 * 1000;
  return new Date(now.getTime() + jstOffset);
}

/**
 * 予約時刻が過ぎているかチェック（日本時間基準）
 */
function isScheduledTimePassed(scheduledTimeIso: string): boolean {
  const scheduledTime = new Date(scheduledTimeIso);
  const now = new Date();
  return scheduledTime.getTime() <= now.getTime();
}

/**
 * 投稿対象の予約を取得
 * - status が 'scheduled'
 * - 予約時刻が現在時刻を過ぎている
 */
async function fetchPendingScheduledPosts(): Promise<ScheduledPostRow[]> {
  // 今日と昨日の範囲で取得（過去の未処理も含む）
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const startDate = yesterday.toISOString().split('T')[0];
  const endDate = now.toISOString().split('T')[0];

  const items = await listScheduledPosts({ startDate, endDate });

  // 投稿対象をフィルタ
  return items.filter((item) => {
    const isScheduled = item.status === 'scheduled';
    const isPastTime = isScheduledTimePassed(item.scheduled_time);
    return isScheduled && isPastTime;
  });
}

/**
 * 単一の予約投稿を実行
 * - メイン投稿を投稿
 * - コメント1を30〜90秒後に投稿
 * - コメント2を30〜90秒後に投稿
 */
async function executeScheduledPost(post: ScheduledPostRow): Promise<{
  success: boolean;
  mainThreadId?: string;
  comment1ThreadId?: string;
  comment2ThreadId?: string;
  error?: string;
}> {
  console.log(`[scheduledPostsWorker] Executing scheduled post: ${post.schedule_id}`);
  console.log(`[scheduledPostsWorker] Scheduled time (JST): ${post.scheduled_at_jst}`);
  console.log(`[scheduledPostsWorker] Main text: ${post.main_text.substring(0, 50)}...`);

  try {
    // ステータスを processing に更新
    await updateScheduledPost(post.schedule_id, { status: 'processing' });

    // 1. メイン投稿
    console.log('[scheduledPostsWorker] Posting main thread...');
    const mainThreadId = await postThread(post.main_text);
    console.log(`[scheduledPostsWorker] Main thread posted: ${mainThreadId}`);

    let replyToId = mainThreadId;
    let comment1ThreadId: string | undefined;
    let comment2ThreadId: string | undefined;

    // 2. コメント1（30〜90秒待機）
    if (post.comment1 && post.comment1.trim().length > 0) {
      const delay1 = Math.floor(Math.random() * 60000) + 30000; // 30〜90秒
      console.log(`[scheduledPostsWorker] Waiting ${(delay1 / 1000).toFixed(1)}s before comment1...`);
      await new Promise((resolve) => setTimeout(resolve, delay1));

      console.log('[scheduledPostsWorker] Posting comment1...');
      comment1ThreadId = await postThread(post.comment1, replyToId);
      console.log(`[scheduledPostsWorker] Comment1 posted: ${comment1ThreadId}`);
      replyToId = comment1ThreadId;
    }

    // 3. コメント2（30〜90秒待機）
    if (post.comment2 && post.comment2.trim().length > 0) {
      const delay2 = Math.floor(Math.random() * 60000) + 30000; // 30〜90秒
      console.log(`[scheduledPostsWorker] Waiting ${(delay2 / 1000).toFixed(1)}s before comment2...`);
      await new Promise((resolve) => setTimeout(resolve, delay2));

      console.log('[scheduledPostsWorker] Posting comment2...');
      comment2ThreadId = await postThread(post.comment2, replyToId);
      console.log(`[scheduledPostsWorker] Comment2 posted: ${comment2ThreadId}`);
    }

    // ステータスを posted に更新
    await updateScheduledPost(post.schedule_id, { status: 'posted' });

    console.log(`[scheduledPostsWorker] Successfully completed: ${post.schedule_id}`);
    return {
      success: true,
      mainThreadId,
      comment1ThreadId,
      comment2ThreadId,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[scheduledPostsWorker] Failed: ${post.schedule_id}`, errorMessage);

    // ステータスを failed に更新
    await updateScheduledPost(post.schedule_id, { status: 'failed' });

    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * 予約投稿ワーカーのメイン処理
 * - 投稿対象の予約を取得
 * - 1件ずつ実行（時差投稿があるため並列実行しない）
 */
export async function processScheduledPosts(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  results: Array<{
    scheduleId: string;
    success: boolean;
    mainThreadId?: string;
    error?: string;
  }>;
}> {
  console.log('[scheduledPostsWorker] Starting scheduled posts processing...');
  console.log('[scheduledPostsWorker] Current time (UTC):', new Date().toISOString());
  console.log('[scheduledPostsWorker] Current time (JST):', getJstNow().toISOString());

  const pendingPosts = await fetchPendingScheduledPosts();
  console.log(`[scheduledPostsWorker] Found ${pendingPosts.length} pending posts`);

  const results: Array<{
    scheduleId: string;
    success: boolean;
    mainThreadId?: string;
    error?: string;
  }> = [];

  let succeeded = 0;
  let failed = 0;

  // 1件ずつ順番に処理（時差投稿があるため）
  for (const post of pendingPosts) {
    const result = await executeScheduledPost(post);
    results.push({
      scheduleId: post.schedule_id,
      success: result.success,
      mainThreadId: result.mainThreadId,
      error: result.error,
    });

    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  console.log(`[scheduledPostsWorker] Completed: ${succeeded} succeeded, ${failed} failed`);

  return {
    processed: pendingPosts.length,
    succeeded,
    failed,
    results,
  };
}
