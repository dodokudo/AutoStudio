import { NextResponse } from 'next/server';
import { buildThreadsPromptPayload } from '@/lib/promptBuilder';
import { generateClaudePlans } from '@/lib/claude';
import { replaceTodayPlans, listPlanSummaries } from '@/lib/bigqueryPlans';
import { notifyGenerateFailure } from '@/lib/notifications';
import { resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();

export async function POST() {
  try {
    const payload = await buildThreadsPromptPayload({ projectId: PROJECT_ID });
    const claudeResult = await generateClaudePlans(payload);

    const fallbackSchedule = payload.meta.recommendedSchedule;
    const generatedPlans = claudeResult.posts.map((post, index) => {
      const planId = post.planId?.trim() || `gen-${index + 1}`;
      const scheduledTime = post.scheduledTime?.trim() || fallbackSchedule[index] || undefined;
      const templateId = post.templateId?.trim() || 'auto-generated';
      const theme = post.theme?.trim() || payload.writingChecklist.enforcedTheme;

      return {
        planId,
        scheduledTime,
        templateId,
        theme,
        mainText: post.mainPost,
        comments: (post.comments ?? []).map((text, commentIndex) => ({ order: commentIndex + 1, text })),
      };
    });

    await replaceTodayPlans(generatedPlans, fallbackSchedule);
    const summaries = await listPlanSummaries();

    return NextResponse.json({ items: summaries }, { status: 200 });
  } catch (error) {
    console.error('[threads/generate] failed', error);
    await notifyGenerateFailure((error as Error).message ?? 'unknown error');
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
