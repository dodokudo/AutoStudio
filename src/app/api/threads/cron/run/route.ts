import { NextResponse } from 'next/server';
// import { processNextJob } from '@/lib/threadsWorker';
// import { updateTemplateScores } from '@/lib/templateScores';

/**
 * Threads投稿cronエンドポイント
 *
 * 🚨 緊急停止: アプリ連携解除のため一時停止 (2026-02-26)
 */
async function handleCronRun() {
  console.log('[threads/cron/run] PAUSED - App disconnected. Skipping at', new Date().toISOString());
  return NextResponse.json(
    { paused: true, reason: 'App disconnected - cron paused', timestamp: new Date().toISOString() },
    { status: 200 },
  );
}

export async function GET() {
  return handleCronRun();
}

export async function POST() {
  return handleCronRun();
}
