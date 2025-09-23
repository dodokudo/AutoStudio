import { NextResponse } from 'next/server';
import { buildThreadsPromptPayload } from '@/lib/promptBuilder';
import { generateClaudePlans } from '@/lib/claude';
import { replaceTodayPlans, listPlanSummaries } from '@/lib/bigqueryPlans';
import { notifyGenerateFailure } from '@/lib/notifications';

const PROJECT_ID = process.env.BQ_PROJECT_ID ?? 'mark-454114';

export async function POST() {
  try {
    const payload = await buildThreadsPromptPayload({ projectId: PROJECT_ID });
    const claudeResult = await generateClaudePlans(payload);

    const fallbackSchedule = payload.meta.recommendedSchedule;
    const generatedPlans = claudeResult.posts.map((post, index) => ({
      planId: post.planId ?? `gen-${index + 1}`,
      scheduledTime: post.scheduledTime ?? fallbackSchedule[index] ?? undefined,
      templateId: post.templateId ?? 'auto-generated',
      theme: post.theme ?? '未分類',
      mainText: post.main,
      comments: (post.comments ?? []).map((text, commentIndex) => ({ order: commentIndex + 1, text })),
    }));

    await replaceTodayPlans(generatedPlans, fallbackSchedule);
    const summaries = await listPlanSummaries();

    return NextResponse.json({ items: summaries }, { status: 200 });
  } catch (error) {
    console.error('[threads/generate] failed', error);
    await notifyGenerateFailure((error as Error).message ?? 'unknown error');
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
