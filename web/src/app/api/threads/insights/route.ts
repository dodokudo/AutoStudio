import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      message: 'Threads insights endpoint is not implemented yet.',
      todo: [
        'Fetch latest metrics from BigQuery',
        'Aggregate 7-day trends for followers and profile views',
        'Return top-performing self posts summary',
      ],
    },
    { status: 501 },
  );
}
