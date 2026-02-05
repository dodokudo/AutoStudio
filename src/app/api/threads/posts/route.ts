import { NextRequest, NextResponse } from 'next/server';
import { getThreadsInsightsData } from '@/lib/threadsInsightsData';

export const revalidate = 300;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate') ?? undefined;
    const endDate = searchParams.get('endDate') ?? undefined;

    const data = await getThreadsInsightsData({ startDate, endDate });

    return NextResponse.json({
      posts: data.posts,
    });
  } catch (error) {
    console.error('[api/threads/posts] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}
