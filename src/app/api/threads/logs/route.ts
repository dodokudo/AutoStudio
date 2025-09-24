import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json(
    {
      message: 'Threads posting logs endpoint is not implemented yet.',
      todo: [
        'Expose recent publishing jobs with status',
        'Include template and performance metadata',
      ],
    },
    { status: 501 },
  );
}
