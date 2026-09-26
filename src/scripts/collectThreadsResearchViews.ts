/**
 * Read public view counts for watched competitor posts and store one snapshot per day.
 *
 *   npm run research:views            # posts from the last 14 days
 *   npm run research:views -- --days=30
 *   npm run research:views -- --days=130 --username=yuki_99_official
 *   npm run research:views -- --days=130 --username=yuki_99_official --concurrency=4
 *
 * Runs without logging in. Pages are opened one at a time with a short pause so the
 * load on Threads stays negligible.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { chromium, type BrowserContext } from 'playwright';

import { THREADS_RESEARCH_OWNER_ID } from '@/lib/threadsResearch';
import {
  listViewTargets,
  parseViewsText,
  savePostViewSnapshots,
  type PostViewSnapshot,
} from '@/lib/threadsResearchViews';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const VIEWS_PATTERN = /表示[\d.,]+(万|億)?回|[\d.,]+[KMB]?\s*views?/i;
const PAGE_TIMEOUT_MS = 30_000;
const VIEWS_TIMEOUT_MS = 15_000;
const PAUSE_MS = 800;
const SAVE_BATCH_SIZE = 50;

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function todayJst(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

async function readViews(context: BrowserContext, url: string): Promise<string | null> {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
    const locator = page.getByText(VIEWS_PATTERN).first();
    await locator.waitFor({ timeout: VIEWS_TIMEOUT_MS });
    return (await locator.innerText()).trim();
  } finally {
    await page.close();
  }
}

async function main(): Promise<void> {
  const days = Number(argValue('days') ?? '14');
  const username = argValue('username')?.replace(/^@/, '').trim().toLowerCase();
  const concurrency = Math.max(1, Math.floor(Number(argValue('concurrency') ?? '1')));
  const snapshotDate = todayJst();
  const allTargets = await listViewTargets(THREADS_RESEARCH_OWNER_ID, days, snapshotDate);
  const targets = username ? allTargets.filter((target) => target.username.toLowerCase() === username) : allTargets;
  console.log(
    `[research:views] ${targets.length} posts to read (last ${days} days${username ? `, @${username}` : ''}) for ${snapshotDate}`,
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ locale: 'ja-JP', userAgent: USER_AGENT });
  let saved = 0;
  let read = 0;
  let failures = 0;

  const byAccount = new Map<string, typeof targets>();
  for (const target of targets) {
    const list = byAccount.get(target.username) ?? [];
    list.push(target);
    byAccount.set(target.username, list);
  }

  try {
    for (const [username, accountTargets] of byAccount) {
      let accountSaved = 0;
      for (let offset = 0; offset < accountTargets.length; offset += SAVE_BATCH_SIZE) {
        const batchTargets = accountTargets.slice(offset, offset + SAVE_BATCH_SIZE);
        const snapshots = new Array<PostViewSnapshot>(batchTargets.length);
        let nextIndex = 0;

        async function worker(): Promise<void> {
          while (nextIndex < batchTargets.length) {
            const index = nextIndex;
            nextIndex += 1;
            const target = batchTargets[index];
            let viewsText: string | null = null;
            try {
              viewsText = await readViews(context, target.permalink);
            } catch (error) {
              failures += 1;
              console.warn(`[research:views] failed ${target.permalink}: ${error instanceof Error ? error.message : String(error)}`);
            }
            const viewsCount = viewsText ? parseViewsText(viewsText) : null;
            if (viewsCount !== null) read += 1;
            snapshots[index] = { ...target, snapshotDate, viewsCount, viewsText };
            await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
          }
        }

        await Promise.all(Array.from({ length: Math.min(concurrency, batchTargets.length) }, () => worker()));
        await savePostViewSnapshots(THREADS_RESEARCH_OWNER_ID, snapshotDate, snapshots);
        accountSaved += snapshots.length;
        saved += snapshots.length;
        console.log(`[research:views] @${username}: ${accountSaved}/${accountTargets.length} posts saved (${read} with views, ${failures} failed)`);
      }
      console.log(`[research:views] @${username}: ${accountSaved} posts saved (${saved}/${targets.length} total, ${read} with views, ${failures} failed)`);
    }
  } finally {
    await browser.close();
  }

  console.log(`[research:views] done: ${saved} rows (${read} with views, ${failures} failed)`);

  if (targets.length > 0 && read === 0) {
    throw new Error('No view counts could be read; the page layout may have changed');
  }
}

main().catch((error) => {
  console.error('[research:views] fatal', error);
  process.exit(1);
});
