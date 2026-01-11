import { NextRequest, NextResponse } from 'next/server';
import { getLinkDailyClicks } from '@/lib/links/bigquery';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('start');
    const endDate = searchParams.get('end');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'start and end query parameters are required' },
        { status: 400 },
      );
    }

    const data = await getLinkDailyClicks(id, { startDate, endDate });

    if (!data) {
      return NextResponse.json(
        { error: 'Link not found' },
        { status: 404 },
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching link daily clicks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch daily clicks' },
      { status: 500 },
    );
  }
}
