import { NextResponse } from 'next/server';
import { listPlanSummaries } from '@/lib/bigqueryPlans';

export async function GET() {
  try {
    console.log('[debug/plan-summaries] Starting to list plan summaries...');
    const planSummaries = await listPlanSummaries();
    console.log('[debug/plan-summaries] Successfully retrieved plan summaries:', planSummaries.length);

    return NextResponse.json({
      planSummariesCount: planSummaries.length,
      planSummaries
    });
  } catch (error) {
    console.error('[debug/plan-summaries] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    return NextResponse.json({
      error: errorMessage,
      stack: errorStack,
      timestamp: new Date().toISOString(),
      fallback: 'Plan summaries data unavailable due to error'
    }, { status: 500 });
  }
}