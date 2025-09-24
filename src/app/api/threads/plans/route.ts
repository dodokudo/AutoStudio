import { NextRequest, NextResponse } from 'next/server';
import { listPlanSummaries, seedPlansIfNeeded, upsertPlan } from '@/lib/bigqueryPlans';
import type { PlanStatus } from '@/types/threadPlan';

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
    const { planId, scheduledTime, mainText, templateId, theme, status, comments } = payload ?? {};
    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    const updated = await upsertPlan({
      plan_id: planId,
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
