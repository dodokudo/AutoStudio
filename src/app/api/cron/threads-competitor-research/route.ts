import { NextRequest, NextResponse } from 'next/server';

import { getThreadsAccessToken } from '@/lib/threadsApi';
import { THREADS_RESEARCH_OWNER_ID } from '@/lib/threadsResearch';
import { collectDailyResearchTargets } from '@/lib/threadsResearchCollector';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = new Date().toISOString();
  console.log('[cron/threads-competitor-research] Started', { startedAt });

  try {
    const accessToken = await getThreadsAccessToken('main');
    if (!accessToken) {
      return NextResponse.json(
        { ok: false, startedAt, error: 'Threads access token is unavailable' },
        { status: 503 }
      );
    }

    const result = await collectDailyResearchTargets(
      THREADS_RESEARCH_OWNER_ID,
      accessToken
    );
    const failed = result.results.filter((account) => !account.ok);
    const response = {
      ok: failed.length === 0,
      startedAt,
      completedAt: result.collectedAt,
      refreshedAccounts: result.results.length - failed.length,
      failedAccounts: failed.map((account) => ({
        username: account.username,
        error: account.error,
      })),
      results: result.results,
    };

    console.log('[cron/threads-competitor-research] Completed', {
      completedAt: result.collectedAt,
      refreshedAccounts: response.refreshedAccounts,
      failedAccounts: response.failedAccounts,
    });

    return NextResponse.json(response, { status: failed.length === 0 ? 200 : 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[cron/threads-competitor-research] Failed', error);
    return NextResponse.json(
      { ok: false, startedAt, completedAt: new Date().toISOString(), error: message },
      { status: 500 }
    );
  }
}
