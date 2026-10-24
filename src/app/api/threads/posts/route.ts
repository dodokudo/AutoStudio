import { NextRequest, NextResponse } from 'next/server';
import { getThreadsInsightsData } from '@/lib/threadsInsightsData';
import { resolveThreadsAccountKey } from '@/lib/threadsAccounts';
import { getSupplementalInsights } from '@/lib/threadsSupplementalInsights';

export const revalidate = 300;

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate') ?? undefined;
    const endDate = searchParams.get('endDate') ?? undefined;
    const accountKey = resolveThreadsAccountKey(searchParams.get('account'));

    const data = await getThreadsInsightsData({ startDate, endDate, limit: null, accountKey });
    const supplemental = await getSupplementalInsights(data.posts);

    return NextResponse.json({
      posts: data.posts.map((post) => ({
        ...post,
        supplementalInsights: post.accountKey === 'main'
          ? supplemental.byPostId.get(post.postedThreadId) ?? null : null,
        commentData: post.commentData.map((comment) => ({
          ...comment,
          supplementalInsights: post.accountKey === 'main'
            ? supplemental.byPostId.get(comment.commentId) ?? null : null,
        })),
      })),
      supplementalStatus: supplemental.status,
    });
  } catch (error) {
    console.error('[api/threads/posts] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch posts' },
      { status: 500 }
    );
  }
}
