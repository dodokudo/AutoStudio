import { NextRequest, NextResponse } from 'next/server';

import { getThreadsAccessToken } from '@/lib/threadsApi';
import { ThreadsConversationAPI } from '@/lib/threadsDiscovery';
import { normalizeUsername } from '@/lib/threadsResearch';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const postId = request.nextUrl.searchParams.get('postId');
  const username = normalizeUsername(request.nextUrl.searchParams.get('username') || '');
  const postedAt = request.nextUrl.searchParams.get('postedAt');
  if (!postId || !username) {
    return NextResponse.json({ error: 'postIdとusernameが必要です' }, { status: 400 });
  }

  try {
    const accessToken = await getThreadsAccessToken('main');
    if (!accessToken) {
      return NextResponse.json({ error: 'Threadsのアクセストークンが見つかりません' }, { status: 503 });
    }
    const chain = await new ThreadsConversationAPI(accessToken).getSelfReplyChain(postId, username, 200);
    const rootTime = postedAt ? new Date(postedAt).getTime() : Number.NaN;
    const replies = chain.map((node) => {
      const nodeTime = new Date(node.timestamp).getTime();
      return {
        text: node.text ?? '',
        depth: node.depth,
        permalink: node.permalink ?? '',
        secondsAfterRoot:
          Number.isFinite(rootTime) && Number.isFinite(nodeTime)
            ? Math.round((nodeTime - rootTime) / 1000)
            : null,
      };
    });
    return NextResponse.json({ replies });
  } catch (error) {
    console.error('[threads/research/thread] failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '返信の取得に失敗しました' },
      { status: 500 },
    );
  }
}
