import { NextRequest, NextResponse } from 'next/server';

import {
  THREADS_RESEARCH_OWNER_ID,
  addToWatchlist,
  getAccountSummaries,
  getDailyPostCounts,
  getProfileHistory,
  listWatchlist,
  normalizeUsername,
  removeFromWatchlist,
} from '@/lib/threadsResearch';
import { estimateDailyViews } from '@/lib/threadsResearchDailyEstimate';
import { getPostViewHistory } from '@/lib/threadsResearchViews';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [watchlist, summaries, history, dailyPostCounts, postViews] = await Promise.all([
      listWatchlist(THREADS_RESEARCH_OWNER_ID),
      getAccountSummaries(THREADS_RESEARCH_OWNER_ID),
      getProfileHistory(THREADS_RESEARCH_OWNER_ID, 90),
      getDailyPostCounts(THREADS_RESEARCH_OWNER_ID, 90),
      getPostViewHistory(THREADS_RESEARCH_OWNER_ID, 60),
    ]);
    const dailyEstimates = estimateDailyViews(history);
    return NextResponse.json({ watchlist, summaries, history, dailyEstimates, dailyPostCounts, postViews });
  } catch (error) {
    console.error('[threads/research/watchlist] list failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '一覧の取得に失敗しました' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const username = normalizeUsername(typeof body.username === 'string' ? body.username : '');
    if (!username) return NextResponse.json({ error: 'usernameが必要です' }, { status: 400 });
    await addToWatchlist(
      THREADS_RESEARCH_OWNER_ID,
      username,
      typeof body.note === 'string' ? body.note : '',
    );
    return NextResponse.json({ username });
  } catch (error) {
    console.error('[threads/research/watchlist] add failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '追加に失敗しました' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const username = request.nextUrl.searchParams.get('username');
  if (!username) return NextResponse.json({ error: 'usernameが必要です' }, { status: 400 });
  try {
    await removeFromWatchlist(THREADS_RESEARCH_OWNER_ID, username);
    return NextResponse.json({ username: normalizeUsername(username) });
  } catch (error) {
    console.error('[threads/research/watchlist] delete failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '削除に失敗しました' },
      { status: 500 },
    );
  }
}
