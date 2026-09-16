import { NextRequest, NextResponse } from 'next/server';

import {
  THREADS_RESEARCH_OWNER_ID,
  getInsights,
  getPosts,
  getThreadNodes,
} from '@/lib/threadsResearch';

export const dynamic = 'force-dynamic';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function jstBoundary(date: string | null, endOfDay: boolean): string | undefined {
  if (!date || !DATE_ONLY.test(date)) return undefined;
  const value = new Date(`${date}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+09:00`);
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
}

export async function GET(request: NextRequest) {
  const rootPostId = request.nextUrl.searchParams.get('postId');
  const username = request.nextUrl.searchParams.get('username') || undefined;
  try {
    if (rootPostId) {
      const nodes = await getThreadNodes(THREADS_RESEARCH_OWNER_ID, rootPostId);
      return NextResponse.json({ nodes });
    }
    const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit') || 100), 1), 5000);
    const since = jstBoundary(request.nextUrl.searchParams.get('fromDate'), false);
    const until = jstBoundary(request.nextUrl.searchParams.get('toDate'), true);
    const [posts, insights] = await Promise.all([
      getPosts(THREADS_RESEARCH_OWNER_ID, {
        username,
        limit,
        treeOnly: request.nextUrl.searchParams.get('treeOnly') === 'true',
        since,
        until,
      }),
      getInsights(THREADS_RESEARCH_OWNER_ID, username),
    ]);
    return NextResponse.json({ posts, insights });
  } catch (error) {
    console.error('[threads/research/posts] failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得に失敗しました' },
      { status: 500 },
    );
  }
}
