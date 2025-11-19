import { NextRequest, NextResponse } from 'next/server';
import { upsertPlan } from '@/lib/bigqueryPlans';
import { postThread } from '@/lib/threadsApi';

// URLからトラッキングパラメータを除去する
function cleanUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // トラッキングパラメータを削除
    const trackingParams = ['xmt', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'igshid'];
    trackingParams.forEach(param => urlObj.searchParams.delete(param));

    // パラメータが空になったらクエリ文字列を完全に削除
    if (urlObj.searchParams.toString() === '') {
      return `${urlObj.origin}${urlObj.pathname}`;
    }
    return urlObj.toString();
  } catch {
    // URL解析に失敗した場合はそのまま返す
    return url;
  }
}

// テキストからURLを検出して分離する
function extractUrlFromText(text: string): { textWithoutUrl: string; url: string | undefined } {
  const urlPattern = /https?:\/\/[^\s]+/g;
  const urls = text.match(urlPattern);

  if (urls && urls.length > 0) {
    const rawUrl = urls[0];
    const cleanedUrl = cleanUrl(rawUrl);

    // Threads URLはlink_attachmentとして使用できないため、クリーンなURLをテキストに含める
    if (rawUrl.includes('threads.com') || rawUrl.includes('threads.net')) {
      const textWithCleanUrl = text.replace(rawUrl, cleanedUrl);
      return { textWithoutUrl: textWithCleanUrl, url: undefined };
    }

    const textWithoutUrl = text.replace(rawUrl, '').trim();

    // テキストが空になる場合は、元のテキストをそのまま使う
    if (!textWithoutUrl) {
      return { textWithoutUrl: text, url: undefined };
    }

    return { textWithoutUrl, url: cleanedUrl };
  }

  return { textWithoutUrl: text, url: undefined };
}

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
        const { textWithoutUrl: mainTextWithoutUrl, url: mainUrl } = extractUrlFromText(mainText);
        console.log(`[plans/update] Main text: "${mainTextWithoutUrl.substring(0, 50)}...", URL: ${mainUrl || 'none'}`);
        const mainThreadId = await postThread(mainTextWithoutUrl, undefined, mainUrl);
        console.log('[plans/update] Main thread posted:', mainThreadId);

        // Post comments in sequence
        let replyToId = mainThreadId;

        // メインスレッド投稿後、APIでメディアが利用可能になるまで待機
        if (comments.length > 0) {
          const initialDelayMs = 10000; // 10秒待機
          console.log(`[plans/update] Waiting ${initialDelayMs / 1000} seconds for main thread to be available...`);
          await new Promise(resolve => setTimeout(resolve, initialDelayMs));
        }

        for (let i = 0; i < comments.length; i++) {
          const comment = comments[i];
          console.log(`[plans/update] Posting comment ${i + 1}/${comments.length}...`);

          // ランダムな待機時間（30秒〜90秒）でbot感を軽減
          const randomDelayMs = Math.floor(Math.random() * 60000) + 30000; // 30000ms〜90000ms (30秒〜1分30秒)
          const delaySeconds = (randomDelayMs / 1000).toFixed(1);
          console.log(`[plans/update] Waiting ${delaySeconds} seconds before posting comment ${i + 1}...`);
          await new Promise(resolve => setTimeout(resolve, randomDelayMs));

          // コメントからURLを検出して分離
          console.log(`[plans/update] Comment ${i + 1} original text:`, JSON.stringify(comment.text));
          const { textWithoutUrl: commentTextWithoutUrl, url: commentUrl } = extractUrlFromText(comment.text);
          console.log(`[plans/update] Comment ${i + 1} extracted:`, {
            textWithoutUrl: commentTextWithoutUrl,
            url: commentUrl,
            textLength: commentTextWithoutUrl.length,
            urlLength: commentUrl?.length
          });
          const commentThreadId = await postThread(commentTextWithoutUrl, replyToId, commentUrl);
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