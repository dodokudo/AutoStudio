import { NextRequest, NextResponse } from 'next/server';
import { seedPlansIfNeeded } from '@/lib/bigqueryPlans';

export async function GET() {
  try {
    const plans = await seedPlansIfNeeded();
    return NextResponse.json({ items: plans });
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
