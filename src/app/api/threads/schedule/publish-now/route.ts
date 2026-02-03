import { NextRequest, NextResponse } from 'next/server';
import { postThread } from '@/lib/threadsApi';

interface PublishNowRequest {
  mainText: string;
  comment1: string;
  comment2: string;
}

function validateTextLength(text: string, fieldName: string): string | null {
  if (!text || text.trim().length === 0) {
    return `${fieldName}は必須です`;
  }
  if (text.length > 500) {
    return `${fieldName}は500文字以内である必要があります`;
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PublishNowRequest;
    const { mainText, comment1, comment2 } = body;

    // バリデーション
    const mainError = validateTextLength(mainText, 'メイン投稿');
    if (mainError) {
      return NextResponse.json({ error: mainError }, { status: 400 });
    }
    const comment1Error = validateTextLength(comment1, 'コメント1');
    if (comment1Error) {
      return NextResponse.json({ error: comment1Error }, { status: 400 });
    }
    const comment2Error = validateTextLength(comment2, 'コメント2');
    if (comment2Error) {
      return NextResponse.json({ error: comment2Error }, { status: 400 });
    }

    console.log('[threads/schedule/publish-now] Starting immediate publish...');

    // メイン投稿
    console.log('[threads/schedule/publish-now] Posting main thread...');
    const mainThreadId = await postThread(mainText);
    console.log('[threads/schedule/publish-now] Main thread posted:', mainThreadId);

    // コメント1（2秒待機）
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log('[threads/schedule/publish-now] Posting comment1...');
    const comment1Id = await postThread(comment1, mainThreadId);
    console.log('[threads/schedule/publish-now] Comment1 posted:', comment1Id);

    // コメント2（2秒待機）
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log('[threads/schedule/publish-now] Posting comment2...');
    const comment2Id = await postThread(comment2, comment1Id);
    console.log('[threads/schedule/publish-now] Comment2 posted:', comment2Id);

    console.log('[threads/schedule/publish-now] All posts completed successfully');

    return NextResponse.json({
      success: true,
      mainThreadId,
      comment1Id,
      comment2Id,
    });
  } catch (error) {
    console.error('[threads/schedule/publish-now] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '投稿に失敗しました' },
      { status: 500 },
    );
  }
}
