import { NextResponse } from 'next/server';
import { processScheduledPosts } from '@/lib/scheduledPostsWorker';

/**
 * 予約投稿を実行するcronエンドポイント
 *
 * - 予約時刻が過ぎた投稿を取得
 * - メイン投稿 → コメント1 → コメント2 の順で時差投稿
 * - 既存のThreads APIを使用
 *
 * 推奨: Vercel Cron で1分ごとに実行
 */
async function handleScheduleRun() {
  try {
    console.log('[threads/schedule/run] Started at', new Date().toISOString());

    const result = await processScheduledPosts();

    console.log('[threads/schedule/run] Completed:', {
      processed: result.processed,
      succeeded: result.succeeded,
      failed: result.failed,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        processed: result.processed,
        succeeded: result.succeeded,
        failed: result.failed,
        recovered: result.recovered,
        results: result.results,
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error('[threads/schedule/run] Failed:', error);
    return NextResponse.json(
      { error: 'Schedule run failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function GET() {
  return handleScheduleRun();
}

export async function POST() {
  return handleScheduleRun();
}
