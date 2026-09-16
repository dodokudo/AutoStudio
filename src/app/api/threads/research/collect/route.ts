import { NextRequest, NextResponse } from 'next/server';

import { getThreadsAccessToken } from '@/lib/threadsApi';
import { THREADS_RESEARCH_OWNER_ID } from '@/lib/threadsResearch';
import { collectAll } from '@/lib/threadsResearchCollector';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function jstBoundary(date: unknown, endOfDay: boolean): string | undefined {
  if (typeof date !== 'string' || !DATE_ONLY.test(date)) return undefined;
  const value = new Date(`${date}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+09:00`);
  return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const accessToken = await getThreadsAccessToken('main');
    if (!accessToken) {
      return NextResponse.json({ error: 'Threadsのアクセストークンが見つかりません' }, { status: 503 });
    }
    const since = jstBoundary(body.fromDate, false);
    const until = jstBoundary(body.toDate, true);
    if ((body.fromDate && !since) || (body.toDate && !until)) {
      return NextResponse.json({ error: '収集期間の日付が不正です' }, { status: 400 });
    }
    if (since && until && new Date(since).getTime() > new Date(until).getTime()) {
      return NextResponse.json({ error: '開始日は終了日以前にしてください' }, { status: 400 });
    }
    const result = await collectAll(THREADS_RESEARCH_OWNER_ID, accessToken, {
      username: typeof body.username === 'string' ? body.username : undefined,
      maxPosts: typeof body.maxPosts === 'number' ? body.maxPosts : undefined,
      since,
      until,
      includeConversations: body.includeConversations !== false,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[threads/research/collect] failed', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '収集に失敗しました' },
      { status: 500 },
    );
  }
}
