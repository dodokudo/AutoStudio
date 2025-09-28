import { NextResponse } from 'next/server';
import { listPlanSummaries, updatePlanStatus } from '@/lib/bigqueryPlans';

export async function POST() {
  try {
    console.log('[debug/reset-failed-jobs] Starting to reset failed jobs...');

    const planSummaries = await listPlanSummaries();
    const failedPlans = planSummaries.filter(plan =>
      plan.job_status === 'failed' && plan.status === 'scheduled'
    );

    console.log('[debug/reset-failed-jobs] Found failed plans:', failedPlans.length);

    const results = [];
    for (const plan of failedPlans) {
      console.log(`[debug/reset-failed-jobs] Resetting job for plan: ${plan.plan_id}`);

      // Reset plan status to draft then back to approved to recreate job
      await updatePlanStatus(plan.plan_id, 'draft');
      const updatedPlan = await updatePlanStatus(plan.plan_id, 'approved');

      results.push({
        plan_id: plan.plan_id,
        success: !!updatedPlan,
        previous_error: plan.job_error_message
      });
    }

    return NextResponse.json({
      success: true,
      resetCount: results.length,
      results,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[debug/reset-failed-jobs] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}