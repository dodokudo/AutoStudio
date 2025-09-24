import { NextResponse } from 'next/server';
import { listPlans } from '@/lib/bigqueryPlans';
import { createJobForPlan } from '@/lib/bigqueryJobs';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const plans = await listPlans();
    const plan = plans.find((item) => item.plan_id === id);
    if (!plan) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const job = await createJobForPlan(plan);
    return NextResponse.json({ job });
  } catch (error) {
    console.error('[threads/plans/rerun] failed', error);
    return NextResponse.json({ error: 'Failed to enqueue job' }, { status: 500 });
  }
}
