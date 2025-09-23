import { NextResponse } from 'next/server';
import { mutatePlanStatus } from '@/lib/threadPlans';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const updated = await mutatePlanStatus(params.id, 'approved');
    if (!updated) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }
    return NextResponse.json({ plan: updated });
  } catch (error) {
    console.error('[threads/plans/approve] failed', error);
    return NextResponse.json({ error: 'Approval failed' }, { status: 500 });
  }
}
