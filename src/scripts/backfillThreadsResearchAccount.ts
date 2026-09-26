import 'dotenv/config';

import { getThreadsAccessToken } from '@/lib/threadsApi';
import {
  THREADS_RESEARCH_OWNER_ID,
  addToWatchlist,
  normalizeUsername,
} from '@/lib/threadsResearch';
import { collectAccount } from '@/lib/threadsResearchCollector';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function jstBoundary(date: string | undefined, endOfDay: boolean): string | undefined {
  if (!date) return undefined;
  if (!DATE_ONLY.test(date)) throw new Error(`${nameFor(endOfDay)} must be YYYY-MM-DD`);
  const value = new Date(`${date}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+09:00`);
  if (Number.isNaN(value.getTime())) throw new Error(`${nameFor(endOfDay)} is invalid`);
  return value.toISOString();
}

function nameFor(endOfDay: boolean): string {
  return endOfDay ? '--to' : '--from';
}

async function main() {
  const username = normalizeUsername(readArg('--username') ?? '');
  const since = jstBoundary(readArg('--from'), false);
  const until = jstBoundary(readArg('--to'), true);
  const maxPosts = Number(readArg('--max-posts') ?? '5000');

  if (!username) throw new Error('--username is required');
  if (!since) throw new Error('--from is required');
  if (!until) throw new Error('--to is required');
  if (!Number.isInteger(maxPosts) || maxPosts < 1) {
    throw new Error('--max-posts must be a positive integer');
  }
  if (new Date(since).getTime() > new Date(until).getTime()) {
    throw new Error('--from must be on or before --to');
  }

  await addToWatchlist(
    THREADS_RESEARCH_OWNER_ID,
    username,
    `固定競合リサーチ対象（${new Date().toLocaleDateString('sv-SE', {
      timeZone: 'Asia/Tokyo',
    })}追加）`,
  );

  const token = await getThreadsAccessToken('main');
  if (!token) throw new Error('Threads access token is unavailable');

  const result = await collectAccount(THREADS_RESEARCH_OWNER_ID, token, username, {
    since,
    until,
    maxPosts,
    includeConversations: true,
  });

  console.log(JSON.stringify({ since, until, ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
