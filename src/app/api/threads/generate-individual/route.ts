import { NextRequest, NextResponse } from 'next/server';
import { buildThreadsPromptPayload } from '@/lib/promptBuilder';
import { generateClaudePlans } from '@/lib/claude';
import { upsertPlan } from '@/lib/bigqueryPlans';
import { resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();

export async function POST(request: NextRequest) {
  try {
    // リクエストからテーマを取得（任意）
    const body = await request.json().catch(() => ({}));
    const customTheme = typeof body?.theme === 'string' ? body.theme.trim() : '';

    // 既存の生成パイプラインを1件用に流用
    let payload;
    try {
      payload = await buildThreadsPromptPayload({ projectId: PROJECT_ID });
    } catch (buildError) {
      console.error('[generate-individual] buildThreadsPromptPayload error:', buildError);
      throw new Error(`プロンプト構築エラー: ${buildError instanceof Error ? buildError.message : 'unknown'}`);
    }

    payload.meta.targetPostCount = 1;
    payload.meta.recommendedSchedule = payload.meta.recommendedSchedule.slice(0, 1);

    // テーマが指定されていればそれを使用、なければデフォルトのAI活用テーマ
    if (customTheme) {
      payload.writingChecklist.enforcedTheme = customTheme;
    }

    let claudeResult;
    try {
      claudeResult = await generateClaudePlans(payload);
    } catch (claudeError) {
      console.error('[generate-individual] generateClaudePlans error:', claudeError);
      throw new Error(`Claude生成エラー: ${claudeError instanceof Error ? claudeError.message : 'unknown'}`);
    }

    if (!claudeResult.posts || claudeResult.posts.length === 0) {
      throw new Error('Claudeから投稿が生成されませんでした');
    }

    const post = claudeResult.posts[0];

    const planId = post.planId?.trim() || `gen-${Date.now()}`;
    const scheduledTime = post.scheduledTime?.trim() || payload.meta.recommendedSchedule[0] || '07:00';
    const theme = post.theme?.trim() || payload.writingChecklist.enforcedTheme;

    await upsertPlan({
      plan_id: planId,
      generation_date: new Date().toISOString().slice(0, 10),
      scheduled_time: scheduledTime,
      template_id: post.templateId?.trim() || 'custom',
      theme,
      status: 'draft',
      main_text: post.mainPost,
      comments: JSON.stringify((post.comments ?? []).map((text, index) => ({ order: index + 1, text }))),
    });

    return NextResponse.json({ planId, result: post }, { status: 200 });
  } catch (error) {
    console.error('[generate-individual] Error:', error);
    const errorMessage = error instanceof Error ? error.message : '不明なエラー';
    const errorStack = error instanceof Error ? error.stack : undefined;

    return NextResponse.json({
      error: '投稿生成中にエラーが発生しました',
      details: errorMessage,
      stack: errorStack
    }, { status: 500 });
  }
}
