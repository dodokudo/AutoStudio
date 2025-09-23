import { NextRequest, NextResponse } from 'next/server';
import { getThreadPlans } from '@/lib/threadPlans';

export async function GET() {
  try {
    const items = await getThreadPlans();
    return NextResponse.json({ items });
  } catch (error) {
    console.error('[threads/plans] failed', error);
    return NextResponse.json(
      { error: 'Failed to load plans' },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  await request.json().catch(() => undefined);
  return NextResponse.json(
    {
      message: 'Updating a Threads plan is not implemented yet.',
      todo: [
        'Validate edited content and schedule time',
        'Persist changes in BigQuery / datastore',
        'Emit activity log for audit trail',
      ],
    },
    { status: 501 },
  );
}
