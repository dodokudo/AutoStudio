import { NextRequest, NextResponse } from 'next/server';
import { postThread } from '@/lib/threadsApi';

interface PublishNowRequest {
  mainText: string;
  comment1: string;
  comment2: string;
  comment3?: string;
  comment4?: string;
  comment5?: string;
  comment6?: string;
  comment7?: string;
  comment8?: string;
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
    const { mainText, comment1, comment2, comment3, comment4, comment5, comment6, comment7, comment8 } = body;

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
    for (const [label, value] of [
      ['コメント3', comment3],
      ['コメント4', comment4],
      ['コメント5', comment5],
      ['コメント6', comment6],
      ['コメント7', comment7],
      ['コメント8', comment8],
    ] as const) {
      if (typeof value === 'string' && value.length > 500) {
        return NextResponse.json({ error: `${label}は500文字以内である必要があります` }, { status: 400 });
      }
    }

    console.log('[threads/schedule/publish-now] Starting immediate publish...');

    // メイン投稿
    console.log('[threads/schedule/publish-now] Posting main thread...');
    const mainThreadId = await postThread(mainText);
    console.log('[threads/schedule/publish-now] Main thread posted:', mainThreadId);

    const commentIds: Record<number, string | undefined> = {};
    const commentList: Array<{ index: number; text?: string }> = [
      { index: 1, text: comment1 },
      { index: 2, text: comment2 },
      { index: 3, text: comment3 },
      { index: 4, text: comment4 },
      { index: 5, text: comment5 },
      { index: 6, text: comment6 },
      { index: 7, text: comment7 },
      { index: 8, text: comment8 },
    ];

    let replyToId = mainThreadId;
    for (const comment of commentList) {
      if (!comment.text || !comment.text.trim()) continue;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      console.log(`[threads/schedule/publish-now] Posting comment${comment.index}...`);
      const id = await postThread(comment.text, replyToId);
      console.log(`[threads/schedule/publish-now] Comment${comment.index} posted:`, id);
      commentIds[comment.index] = id;
      replyToId = id;
    }

    console.log('[threads/schedule/publish-now] All posts completed successfully');

    return NextResponse.json({
      success: true,
      mainThreadId,
      comment1Id: commentIds[1],
      comment2Id: commentIds[2],
      comment3Id: commentIds[3],
      comment4Id: commentIds[4],
      comment5Id: commentIds[5],
      comment6Id: commentIds[6],
      comment7Id: commentIds[7],
      comment8Id: commentIds[8],
    });
  } catch (error) {
    console.error('[threads/schedule/publish-now] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '投稿に失敗しました' },
      { status: 500 },
    );
  }
}
