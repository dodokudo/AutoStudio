import { NextRequest, NextResponse } from 'next/server';

import { getThreadsAccessToken } from '@/lib/threadsApi';
import { ThreadsDiscoveryAPI } from '@/lib/threadsDiscovery';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const keyword = (request.nextUrl.searchParams.get('q') || '').trim();
  if (!keyword) {
    return NextResponse.json({ error: 'キーワードを入力してください' }, { status: 400 });
  }

  try {
    const accessToken = await getThreadsAccessToken('main');
    if (!accessToken) {
      return NextResponse.json({ error: 'Threadsのアクセストークンが見つかりません' }, { status: 503 });
    }

    const searchMode = request.nextUrl.searchParams.get('mode') === 'TAG' ? 'TAG' : 'KEYWORD';
    const searchType = request.nextUrl.searchParams.get('sort') === 'RECENT' ? 'RECENT' : 'TOP';
    const posts = await new ThreadsDiscoveryAPI(accessToken).keywordSearch(keyword, {
      searchMode,
      searchType,
      limit: 50,
    });
    const counts = new Map<string, number>();
    posts.forEach((post) => {
      if (post.username) counts.set(post.username, (counts.get(post.username) || 0) + 1);
    });
    const authors = Array.from(counts, ([username, postCount]) => ({ username, postCount }))
      .sort((left, right) => right.postCount - left.postCount);

    return NextResponse.json({ keyword, searchMode, searchType, posts, authors });
  } catch (error) {
    console.error('[threads/research/search] failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '検索に失敗しました' },
      { status: 500 },
    );
  }
}
