import { NextResponse } from 'next/server';

/**
 * 自動コメントチェックエンドポイント
 *
 * 🚨 緊急停止: アプリ連携解除のため一時停止 (2026-02-26)
 */
export async function POST() {
  console.log('[threads/auto-comment/check] PAUSED - App disconnected. Skipping at', new Date().toISOString());
  return NextResponse.json({ paused: true, reason: 'App disconnected' }, { status: 200 });
}

export async function GET() {
  return POST();
}
