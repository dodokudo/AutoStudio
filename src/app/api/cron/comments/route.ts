import { NextResponse } from 'next/server';

/**
 * コメント実行cronエンドポイント
 *
 * 🚨 緊急停止: アプリ連携解除のため一時停止 (2026-02-26)
 */
export async function GET() {
  console.log('[cron/comments] PAUSED - App disconnected. Skipping at', new Date().toISOString());
  return NextResponse.json({ paused: true, reason: 'App disconnected' }, { status: 200 });
}
