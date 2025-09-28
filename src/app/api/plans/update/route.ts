import { NextRequest, NextResponse } from 'next/server';
import { upsertPlan } from '@/lib/bigqueryPlans';
import { postThread } from '@/lib/threadsApi';

interface UpdatePlanRequest {
  planId: string;
  status: 'draft' | 'approved';
  mainText: string;
  comments: { order: number; text: string }[];
  scheduledTime: string;
  postNow?: boolean;
}

export async function POST(request: NextRequest) {
  console.log('[plans/update] POST request received');
  try {
    const body = await request.json() as UpdatePlanRequest;
    const { planId, status, mainText, comments, scheduledTime, postNow } = body;

    console.log('[plans/update] Request body:', {
      planId,
      status,
      mainTextLength: mainText?.length,
      commentsCount: comments?.length,
      scheduledTime,
      postNow
    });

    if (!planId || !status || !mainText) {
      console.error('[plans/update] Missing required parameters:', { planId: !!planId, status: !!status, mainText: !!mainText });
      return NextResponse.json({ error: '必須パラメータが不足しています' }, { status: 400 });
    }

    // Update plan in BigQuery
    await upsertPlan({
      plan_id: planId,
      generation_date: new Date().toISOString().slice(0, 10),
      scheduled_time: scheduledTime,
      template_id: 'custom', // Individual posts use custom template
      theme: mainText.substring(0, 100) + '...', // Use truncated main text as theme
      status,
      main_text: mainText,
      comments: JSON.stringify(comments),
    });

    // If posting immediately, post to Threads
    if (postNow && status === 'approved') {
      try {
        console.log('[plans/update] Posting immediately to Threads...');
        console.log('[plans/update] Environment check:', {
          THREADS_POSTING_ENABLED: process.env.THREADS_POSTING_ENABLED,
          hasThreadsToken: !!process.env.THREADS_TOKEN,
          hasBusinessId: !!process.env.THREADS_BUSINESS_ID
        });

        // Post main thread
        const mainThreadId = await postThread(mainText);
        console.log('[plans/update] Main thread posted:', mainThreadId);

        // Post comments in sequence
        let replyToId = mainThreadId;
        for (let i = 0; i < comments.length; i++) {
          const comment = comments[i];
          console.log(`[plans/update] Posting comment ${i + 1}/${comments.length}...`);

          if (i > 0) {
            // Add delay between comments
            await new Promise(resolve => setTimeout(resolve, 3000));
          }

          const commentThreadId = await postThread(comment.text, replyToId);
          console.log(`[plans/update] Comment ${i + 1} posted:`, commentThreadId);
          replyToId = commentThreadId;
        }

        // Update plan status to posted
        await upsertPlan({
          plan_id: planId,
          generation_date: new Date().toISOString().slice(0, 10),
          scheduled_time: scheduledTime,
          template_id: 'custom',
          theme: mainText.substring(0, 100) + '...',
          status: 'posted',
          main_text: mainText,
          comments: JSON.stringify(comments),
        });

        return NextResponse.json({
          success: true,
          message: '投稿を即座に配信しました',
          threadsId: mainThreadId
        });
      } catch (threadsError) {
        console.error('[plans/update] Threads posting error:', threadsError);
        console.error('[plans/update] Error details:', {
          name: threadsError instanceof Error ? threadsError.name : 'unknown',
          message: threadsError instanceof Error ? threadsError.message : String(threadsError),
          stack: threadsError instanceof Error ? threadsError.stack : 'no stack',
          env: {
            THREADS_POSTING_ENABLED: process.env.THREADS_POSTING_ENABLED,
            hasToken: !!process.env.THREADS_TOKEN,
            hasBusinessId: !!process.env.THREADS_BUSINESS_ID
          }
        });
        return NextResponse.json({
          error: 'プランの保存は成功しましたが、Threads投稿に失敗しました',
          details: threadsError instanceof Error ? threadsError.message : 'unknown',
          debugInfo: {
            environment: process.env.NODE_ENV,
            postingEnabled: process.env.THREADS_POSTING_ENABLED,
            hasCredentials: !!(process.env.THREADS_TOKEN && process.env.THREADS_BUSINESS_ID)
          }
        }, { status: 500 });
      }
    }

    const message = status === 'approved'
      ? '投稿を承認しました。スケジュールに沿って配信されます。'
      : '下書きを保存しました。';

    return NextResponse.json({ success: true, message });
  } catch (error) {
    console.error('[plans/update] Error:', error);
    const errorMessage = error instanceof Error ? error.message : '不明なエラー';

    return NextResponse.json({
      error: '投稿の保存または承認に失敗しました',
      details: errorMessage
    }, { status: 500 });
  }
}