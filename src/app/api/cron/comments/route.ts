import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    console.log('[cron/comments] Starting scheduled comment execution cron job...');

    // コメント実行APIを呼び出し
    const response = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3001'}/api/threads/comments/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to execute comments');
    }

    console.log(`[cron/comments] Cron job completed: ${result.executed}/${result.total} comments executed`);

    return NextResponse.json({
      success: true,
      message: `Executed ${result.executed}/${result.total} scheduled comments`,
      result
    });

  } catch (error) {
    console.error('[cron/comments] Cron job error:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}