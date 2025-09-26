import { NextResponse } from 'next/server';
import { buildThreadsPromptPayload } from '@/lib/promptBuilder';
import { generateClaudePlans } from '@/lib/claude';
import { replaceTodayPlans } from '@/lib/bigqueryPlans';
import { notifyGenerateFailure } from '@/lib/notifications';
import { resolveProjectId } from '@/lib/bigquery';
import type { PlanStatus, ThreadPlanSummary } from '@/types/threadPlan';

const PROJECT_ID = resolveProjectId();

export async function POST() {
  try {
    console.log('[threads/generate] Starting payload build...');
    const payload = await buildThreadsPromptPayload({ projectId: PROJECT_ID });
    console.log('[threads/generate] Payload built:', {
      targetPostCount: payload.meta.targetPostCount,
      curatedPostsCount: payload.curatedSelfPosts.length,
      writingTheme: payload.writingChecklist.enforcedTheme
    });

    console.log('[threads/generate] Calling Claude API...');
    const claudeResult = await generateClaudePlans(payload);
    console.log('[threads/generate] Claude result:', {
      postsCount: claudeResult.posts.length,
      posts: claudeResult.posts.map((p, i) => ({
        index: i,
        planId: p.planId,
        hasMainPost: !!p.mainPost,
        mainPostLength: p.mainPost?.length || 0,
        commentsCount: p.comments?.length || 0,
        theme: p.theme
      }))
    });

    const fallbackSchedule = payload.meta.recommendedSchedule;
    const generatedPlans = claudeResult.posts.map((post, index) => {
      const planId = post.planId?.trim() || `gen-${index + 1}`;
      const scheduledTime = post.scheduledTime?.trim() || fallbackSchedule[index] || undefined;
      const templateId = post.templateId?.trim() || 'auto-generated';
      const theme = post.theme?.trim() || payload.writingChecklist.enforcedTheme;
      const status = ((post as { status?: PlanStatus }).status ?? 'draft') as PlanStatus;

      return {
        planId,
        scheduledTime,
        templateId,
        theme,
        mainText: post.mainPost,
        comments: (post.comments ?? []).map((text, commentIndex) => ({ order: commentIndex + 1, text })),
        status,
      };
    });

    console.log('[threads/generate] Generated plans:', {
      count: generatedPlans.length,
      plans: generatedPlans.map((p, i) => ({
        index: i,
        planId: p.planId,
        theme: p.theme,
        mainTextLength: p.mainText.length,
        commentsCount: p.comments.length
      }))
    });

    if (!generatedPlans.length) {
      console.error('[threads/generate] No plans generated from Claude response');
      throw new Error('[threads/generate] Claude returned no posts');
    }

    let summaries: ThreadPlanSummary[] = [];
    try {
      console.log('[threads/generate] Attempting to persist to BigQuery...');
      const persisted = await replaceTodayPlans(generatedPlans, fallbackSchedule);
      console.log('[threads/generate] BigQuery persistence successful:', {
        persistedCount: persisted.length,
        planIds: persisted.map(p => p.plan_id)
      });
      summaries = persisted.map((plan) => ({
        plan_id: plan.plan_id,
        scheduled_time: plan.scheduled_time,
        status: plan.status,
        template_id: plan.template_id,
        theme: plan.theme,
        main_text: plan.main_text,
        comments: plan.comments,
        job_status: undefined,
        job_updated_at: undefined,
        job_error_message: undefined,
        log_status: undefined,
        log_error_message: undefined,
        log_posted_thread_id: undefined,
        log_posted_at: undefined,
      }));
    } catch (error) {
      console.error('[threads/generate] Failed to persist plans to BigQuery:', error);
      console.error('[threads/generate] Error details:', {
        message: (error as Error).message,
        stack: (error as Error).stack
      });
    }

    if (!summaries.length) {
      console.log('[threads/generate] Using fallback summaries (BigQuery failed)');
      summaries = generatedPlans.map((plan, index) => ({
        plan_id: plan.planId,
        scheduled_time: plan.scheduledTime ?? fallbackSchedule[index] ?? '07:00',
        status: plan.status ?? 'draft',
        template_id: plan.templateId,
        theme: plan.theme,
        main_text: plan.mainText,
        comments: JSON.stringify(plan.comments ?? []),
        job_status: undefined,
        job_updated_at: undefined,
        job_error_message: undefined,
        log_status: undefined,
        log_error_message: undefined,
        log_posted_thread_id: undefined,
        log_posted_at: undefined,
      }));
      console.log('[threads/generate] Fallback summaries created:', {
        count: summaries.length,
        planIds: summaries.map(s => s.plan_id)
      });
    }

    console.log('[threads/generate] Final response:', {
      itemsCount: summaries.length,
      success: true
    });

    return NextResponse.json({ items: summaries }, { status: 200 });
  } catch (error) {
    console.error('[threads/generate] failed', error);
    await notifyGenerateFailure((error as Error).message ?? 'unknown error');
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
