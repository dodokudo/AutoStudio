import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      message: 'Threads plans endpoint is not implemented yet.',
      todo: [
        'Read pending generation payloads',
        'Join template performance metadata',
        'Return 10 planned posts for approval UI',
      ],
    },
    { status: 501 },
  );
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
