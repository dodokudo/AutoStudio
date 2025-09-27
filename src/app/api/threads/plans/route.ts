import { NextRequest, NextResponse } from 'next/server';
import { listPlanSummaries, seedPlansIfNeeded, upsertPlan } from '@/lib/bigqueryPlans';
import type { PlanStatus } from '@/types/threadPlan';

function validateTextLength(mainText?: string, comments?: { text: string }[]): string | null {
  if (mainText && mainText.length > 500) {
    return 'メイン投稿は500文字以内である必要があります';
  }

  if (comments && Array.isArray(comments)) {
    for (let i = 0; i < comments.length; i++) {
      if (comments[i]?.text && comments[i].text.length > 500) {
        return `コメント${i + 1}は500文字以内である必要があります`;
      }
    }
  }

  return null;
}

export async function GET() {
  try {
    await seedPlansIfNeeded();
    const summaries = await listPlanSummaries();
    return NextResponse.json({ items: summaries });
  } catch (error) {
    console.error('[threads/plans] failed', error);
    return NextResponse.json(
      { error: 'Failed to load plans' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = await request.json();
    const { planId, scheduledTime, mainText, templateId, theme, status, comments, generationDate } = payload ?? {};
    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    // 文字数バリデーション
    const validationError = validateTextLength(mainText, comments);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const updated = await upsertPlan({
      plan_id: planId,
      generation_date: typeof generationDate === 'string' ? generationDate : undefined,
      scheduled_time: typeof scheduledTime === 'string' ? scheduledTime : undefined,
      main_text: typeof mainText === 'string' ? mainText : undefined,
      template_id: typeof templateId === 'string' ? templateId : undefined,
      theme: typeof theme === 'string' ? theme : undefined,
      status: status as PlanStatus | undefined,
      comments: Array.isArray(comments) ? JSON.stringify(comments) : undefined,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
    }

    return NextResponse.json({ plan: updated });
  } catch (error) {
    console.error('[threads/plans] update failed', error);
    return NextResponse.json({ error: 'Failed to update plan' }, { status: 500 });
  }
}
