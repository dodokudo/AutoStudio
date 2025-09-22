import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      message: 'Approving a Threads plan is not implemented yet.',
      todo: [
        'Mark plan as approved with schedule time',
        'Create publishing job entry',
        'Trigger validation hooks (length, CTA, etc.)',
      ],
    },
    { status: 501 },
  );
}
