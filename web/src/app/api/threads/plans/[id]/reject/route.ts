import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      message: 'Rejecting a Threads plan is not implemented yet.',
      todo: [
        'Return edited plan to generation backlog',
        'Capture rejection reason for prompt fine-tuning',
      ],
    },
    { status: 501 },
  );
}
