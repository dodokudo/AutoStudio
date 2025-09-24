import { NextResponse } from 'next/server';
import { getThreadsInsights } from '@/lib/threadsInsights';

const PROJECT_ID = process.env.BQ_PROJECT_ID ?? 'mark-454114';

export async function GET() {
  try {
    const data = await getThreadsInsights(PROJECT_ID);
    const payload = {
      meta: data.meta,
      accountSummary: data.accountSummary,
      topSelfPosts: data.topSelfPosts.slice(0, 10),
      competitorHighlights: data.competitorHighlights,
      trendingTopics: data.trendingTopics,
    };

    return NextResponse.json(payload, { status: 200 });
  } catch (error) {
    console.error('[threads/insights] failed', error);
    return NextResponse.json(
      { error: 'Failed to load insights data' },
      { status: 500 },
    );
  }
}
