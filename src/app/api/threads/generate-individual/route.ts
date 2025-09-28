import { NextRequest, NextResponse } from 'next/server';
import { buildThreadsPromptPayload } from '@/lib/promptBuilder';
import { generateClaudePlans } from '@/lib/claude';
import { replaceTodayPlans, upsertPlan } from '@/lib/bigqueryPlans';
import { resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const theme = typeof body?.theme === 'string' ? body.theme.trim() : '';

    if (!theme) {
      return NextResponse.json({ error: 'テーマが指定されていません' }, { status: 400 });
    }

    // 既存の生成パイプラインを1件用に流用
    const payload = await buildThreadsPromptPayload({ projectId: PROJECT_ID });
    payload.meta.targetPostCount = 1;
    payload.meta.recommendedSchedule = payload.meta.recommendedSchedule.slice(0, 1);
    payload.writingChecklist.enforcedTheme = theme;

    const claudeResult = await generateClaudePlans(payload);
    const post = claudeResult.posts[0];

    const planId = post.planId?.trim() || `gen-${Date.now()}`;
    const scheduledTime = post.scheduledTime?.trim() || payload.meta.recommendedSchedule[0] || '07:00';

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

    await replaceTodayPlans([], payload.meta.recommendedSchedule);

    return NextResponse.json({ planId, result: post }, { status: 200 });
  } catch (error) {
    console.error('[generate-individual] Error:', error);
    return NextResponse.json({ error: '投稿生成中にエラーが発生しました' }, { status: 500 });
  }
}
