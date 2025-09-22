import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  await request.json().catch(() => undefined);
  return NextResponse.json(
    {
      message: 'Threads publishing worker is not implemented yet.',
      todo: [
        'Validate job payload',
        'Call Threads API for main post + comments',
        'Persist results and schedule retries',
      ],
    },
    { status: 501 },
  );
}
