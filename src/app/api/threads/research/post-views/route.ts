import { NextRequest, NextResponse } from 'next/server';

import { THREADS_RESEARCH_OWNER_ID } from '@/lib/threadsResearch';
import { getPostsWithLatestViews } from '@/lib/threadsResearchViews';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const days = Number(request.nextUrl.searchParams.get('days') || 130);
  try {
    const posts = await getPostsWithLatestViews(THREADS_RESEARCH_OWNER_ID, days);
    return NextResponse.json({ posts });
  } catch (error) {
    console.error('[threads/research/post-views] failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得に失敗しました' },
      { status: 500 },
    );
  }
}
