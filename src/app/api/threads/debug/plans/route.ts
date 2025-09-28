import { NextResponse } from 'next/server';
import { listPlans } from '@/lib/bigqueryPlans';

export async function GET() {
  try {
    const plans = await listPlans();

    const debugPlans = plans.map(plan => ({
      plan_id: plan.plan_id,
      status: plan.status,
      scheduled_time: plan.scheduled_time,
      main_text: plan.main_text.substring(0, 100) + '...',
      comments: plan.comments,
      commentsCount: plan.comments ? JSON.parse(plan.comments).length : 0,
      parsedComments: plan.comments ? JSON.parse(plan.comments) : []
    }));

    return NextResponse.json({
      plansCount: plans.length,
      plans: debugPlans
    });
  } catch (error) {
    console.error('[debug/plans] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}