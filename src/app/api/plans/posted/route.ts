import { NextResponse } from 'next/server';
import { listPlanSummaries } from '@/lib/bigqueryPlans';

export async function GET() {
  try {
    console.log('[api/plans/posted] Fetching posted plans...');

    // Get all plans and filter for posted status
    const allPlans = await listPlanSummaries();
    const postedPlans = allPlans.filter(plan => plan.status === 'posted');

    // Sort by most recent first
    postedPlans.sort((a, b) => {
      const aDate = a.log_posted_at || a.updated_at;
      const bDate = b.log_posted_at || b.updated_at;
      return new Date(bDate).getTime() - new Date(aDate).getTime();
    });

    console.log(`[api/plans/posted] Found ${postedPlans.length} posted plans`);

    return NextResponse.json({
      success: true,
      plans: postedPlans,
      count: postedPlans.length
    });
  } catch (error) {
    console.error('[api/plans/posted] Error:', error);
    const errorMessage = error instanceof Error ? error.message : '不明なエラー';

    return NextResponse.json({
      error: '投稿済みプランの取得に失敗しました',
      details: errorMessage
    }, { status: 500 });
  }
}