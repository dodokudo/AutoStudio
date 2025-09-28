import { NextRequest, NextResponse } from 'next/server';
import { updatePlanStatus } from '@/lib/bigqueryPlans';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { planId } = body;

    if (!planId) {
      return NextResponse.json({ error: 'planId is required' }, { status: 400 });
    }

    console.log(`[debug/approve-plan] Approving plan: ${planId}`);

    const updatedPlan = await updatePlanStatus(planId, 'approved');

    return NextResponse.json({
      success: true,
      planId,
      updatedPlan,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[debug/approve-plan] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}