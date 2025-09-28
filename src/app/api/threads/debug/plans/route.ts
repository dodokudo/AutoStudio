import { NextResponse } from 'next/server';
import { listPlans } from '@/lib/bigqueryPlans';

export async function GET() {
  try {
    console.log('[debug/plans] Starting to list plans...');
    const plans = await listPlans();
    console.log('[debug/plans] Successfully retrieved plans:', plans.length);

    const debugPlans = plans.map(plan => {
      let parsedComments: unknown[] = [];
      let commentsCount = 0;

      if (plan.comments) {
        try {
          parsedComments = JSON.parse(plan.comments);
          commentsCount = Array.isArray(parsedComments) ? parsedComments.length : 0;
        } catch (parseError) {
          console.warn('[debug/plans] Failed to parse comments for plan', plan.plan_id, parseError);
          parsedComments = [];
          commentsCount = 0;
        }
      }

      return {
        plan_id: plan.plan_id,
        status: plan.status,
        scheduled_time: plan.scheduled_time,
        main_text: plan.main_text.substring(0, 100) + '...',
        comments: plan.comments,
        commentsCount,
        parsedComments
      };
    });

    return NextResponse.json({
      plansCount: plans.length,
      plans: debugPlans
    });
  } catch (error) {
    console.error('[debug/plans] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    return NextResponse.json({
      error: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString(),
      fallback: 'Plans data unavailable due to error'
    }, { status: 500 });
  }
}