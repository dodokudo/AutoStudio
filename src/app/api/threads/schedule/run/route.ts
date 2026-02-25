import { NextResponse } from 'next/server';
// import { processScheduledPosts } from '@/lib/scheduledPostsWorker';

/**
 * 予約投稿を実行するcronエンドポイント
 *
 * 🚨 緊急停止: アプリ連携解除のため一時停止 (2026-02-26)
 */
async function handleScheduleRun() {
  console.log('[threads/schedule/run] PAUSED - App disconnected. Skipping at', new Date().toISOString());
  return NextResponse.json(
    { paused: true, reason: 'App disconnected - scheduled posts paused', timestamp: new Date().toISOString() },
    { status: 200 },
  );
}

export async function GET() {
  return handleScheduleRun();
}

export async function POST() {
  return handleScheduleRun();
}
