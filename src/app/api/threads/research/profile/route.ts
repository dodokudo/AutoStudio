import { NextRequest, NextResponse } from 'next/server';

import { getThreadsAccessToken } from '@/lib/threadsApi';
import { ThreadsDiscoveryAPI } from '@/lib/threadsDiscovery';
import { normalizeUsername } from '@/lib/threadsResearch';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const username = normalizeUsername(request.nextUrl.searchParams.get('username') || '');
  if (!username) {
    return NextResponse.json({ error: 'usernameを入力してください' }, { status: 400 });
  }

  try {
    const accessToken = await getThreadsAccessToken('main');
    if (!accessToken) {
      return NextResponse.json({ error: 'Threadsのアクセストークンが見つかりません' }, { status: 503 });
    }
    const discovery = new ThreadsDiscoveryAPI(accessToken);
    const [profile, rawPosts] = await Promise.all([
      discovery.profileLookup(username),
      discovery.getProfilePosts(username, 15),
    ]);
    const posts = rawPosts.map((post) => ({
      id: post.id,
      text: post.text ?? '',
      timestamp: post.timestamp,
      permalink: post.permalink ?? '',
      mediaType: post.media_type ?? '',
      textLength: [...(post.text ?? '')].length,
      hasReplies: post.has_replies !== false,
    }));
    return NextResponse.json({ profile, posts });
  } catch (error) {
    console.error('[threads/research/profile] failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '取得に失敗しました' },
      { status: 500 },
    );
  }
}
