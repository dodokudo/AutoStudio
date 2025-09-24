import { NextResponse } from 'next/server';
import { updatePlanStatus } from '@/lib/bigqueryPlans';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const updated = await updatePlanStatus(id, 'approved');
    if (!updated) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }
    return NextResponse.json({ plan: updated });
  } catch (error) {
    console.error('[threads/plans/approve] failed', error);
    return NextResponse.json({ error: 'Approval failed' }, { status: 500 });
  }
}
