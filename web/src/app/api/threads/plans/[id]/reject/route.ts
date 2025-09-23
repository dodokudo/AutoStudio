import { NextResponse } from 'next/server';
import { mutatePlanStatus } from '@/lib/threadPlans';

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const updated = await mutatePlanStatus(params.id, 'rejected');
    if (!updated) {
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }
    return NextResponse.json({ plan: updated });
  } catch (error) {
    console.error('[threads/plans/reject] failed', error);
    return NextResponse.json({ error: 'Rejection failed' }, { status: 500 });
  }
}
