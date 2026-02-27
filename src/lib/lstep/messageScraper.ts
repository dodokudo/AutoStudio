import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Browser, chromium, Page } from 'playwright';
import { Storage } from '@google-cloud/storage';
import { LstepConfig } from './config';
import { downloadObjectToFile, uploadFileToGcs } from './gcs';
import { CookieExpiredError, MissingStorageStateError } from './errors';
import type { ScrapedBroadcast, ScrapedUrlMetric, ScrapedTagMetric } from './messageTypes';

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class ScrapeFailedError extends Error {
  constructor(message = '一斉配信スクレイピングに失敗しました', options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ScrapeFailedError';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const BASE_URL = 'https://manager.linestep.net';

function isLoginPage(page: Page): boolean {
  return page.url().includes('/account/login');
}

/**
 * Parse "219（28.3%）" into { count: 219, rate: 28.3 }.
 * Returns null when the text doesn't match.
 */
function parseCountAndRate(text: string): { count: number; rate: number } | null {
  // Full-width parentheses: （ ）  and ％ are sometimes used
  const normalized = text
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/％/g, '%')
    .trim();

  const m = normalized.match(/(\d[\d,]*)[\s]*\(([\d.]+)%\)/);
  if (!m) return null;

  const count = Number(m[1].replace(/,/g, ''));
  const rate = Number.parseFloat(m[2]);
  if (!Number.isFinite(count) || !Number.isFinite(rate)) return null;
  return { count, rate };
}

/**
 * Extract numeric ID from an href like "/line/magazine/sendlogs/12345".
 */
function extractSendlogsId(href: string): string | null {
  const m = href.match(/\/magazine\/sendlogs\/(\d+)/);
  return m ? m[1] : null;
}

/**
 * Parse a plain number text (possibly with commas).
 */
function parseNumber(text: string): number {
  const cleaned = text.replace(/[,\s]/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Function 1: scrapeBroadcasts
// ---------------------------------------------------------------------------

export async function scrapeBroadcasts(page: Page): Promise<ScrapedBroadcast[]> {
  const results: ScrapedBroadcast[] = [];
  let currentPage = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    console.log(`一斉配信リスト: ページ ${currentPage} をスクレイピング中...`);

    if (currentPage === 1) {
      await page.goto(`${BASE_URL}/line/magazine`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
    }

    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {
      // networkidle can sometimes stall; continue anyway
    });
    await page.waitForTimeout(2000);

    if (isLoginPage(page)) {
      throw new CookieExpiredError('一斉配信ページでログインリダイレクトを検出');
    }

    // Click all 「更新」 buttons in cell index 6 (開封数) to refresh counts
    // The 更新 buttons are small links/buttons inside the open-count cells.
    const refreshButtons = page.locator('tbody tr td:nth-child(7) a, tbody tr td:nth-child(7) button')
      .filter({ hasText: '更新' });
    const refreshCount = await refreshButtons.count();

    if (refreshCount > 0) {
      console.log(`  開封数の「更新」ボタン ${refreshCount} 件をクリック中...`);
      for (let i = 0; i < refreshCount; i++) {
        try {
          await refreshButtons.nth(i).click({ timeout: 3000 });
          // Small wait for each refresh response
          await page.waitForTimeout(500);
        } catch {
          // Individual button click failure is non-fatal
        }
      }
      // Wait for all refresh XHR to settle
      await page.waitForTimeout(3000);
    }

    // Scrape each row in the table body
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    console.log(`  テーブル行数: ${rowCount}`);

    for (let i = 0; i < rowCount; i++) {
      try {
        const row = rows.nth(i);
        const cells = row.locator('td');
        const cellCount = await cells.count();

        if (cellCount < 8) continue; // not a data row

        // Cell 0-1: 配信名 + 日時
        const nameCell = cells.nth(0);
        const broadcastName = (await nameCell.innerText()).trim();

        const dateCell = cells.nth(1);
        const sentAt = (await dateCell.innerText()).trim();

        // Cell 6: 開封数 — format "219（28.3%）"
        const openCell = cells.nth(6);
        const openText = (await openCell.innerText()).trim();
        const parsed = parseCountAndRate(openText);
        const openCount = parsed?.count ?? 0;
        const openRate = parsed?.rate ?? 0;

        // Cell 7: 配信数 — contains link to /magazine/sendlogs/{id}
        const deliveryCell = cells.nth(7);
        const deliveryText = (await deliveryCell.innerText()).trim();
        const deliveryCount = parseNumber(deliveryText);

        // Extract broadcast ID from the sendlogs link
        const sendlogsLink = deliveryCell.locator('a[href*="/magazine/sendlogs/"]');
        const linkCount = await sendlogsLink.count();
        let broadcastId: string | null = null;

        if (linkCount > 0) {
          const href = await sendlogsLink.first().getAttribute('href');
          broadcastId = href ? extractSendlogsId(href) : null;
        }

        if (!broadcastId) {
          // Skip rows where we can't identify the broadcast
          console.warn(`  行 ${i}: broadcastId が取得できませんでした (配信名: ${broadcastName})`);
          continue;
        }

        results.push({
          broadcastId,
          broadcastName,
          sentAt,
          deliveryCount,
          openCount,
          openRate,
        });
      } catch (err) {
        console.warn(`  行 ${i} のスクレイピングに失敗:`, err);
      }
    }

    // Check for pagination "次へ" link
    const nextLink = page.locator('a:has-text("次へ"), a:has-text("›"), .pagination .next a');
    const nextCount = await nextLink.count();

    if (nextCount > 0) {
      try {
        const isDisabled = await nextLink.first().evaluate(
          (el) => el.classList.contains('disabled') || el.closest('li')?.classList.contains('disabled') || false,
        );

        if (isDisabled) {
          hasNextPage = false;
        } else {
          await nextLink.first().click({ timeout: 5000 });
          await page.waitForLoadState('domcontentloaded');
          await page.waitForTimeout(2000);
          currentPage++;
        }
      } catch {
        hasNextPage = false;
      }
    } else {
      hasNextPage = false;
    }
  }

  console.log(`一斉配信スクレイピング完了: ${results.length} 件取得`);
  return results;
}

// ---------------------------------------------------------------------------
// Function 2: scrapeUrlMetrics
// ---------------------------------------------------------------------------

export async function scrapeUrlMetrics(page: Page, urlIds: string[]): Promise<ScrapedUrlMetric[]> {
  const results: ScrapedUrlMetric[] = [];

  for (const urlId of urlIds) {
    try {
      console.log(`URL計測 ${urlId} をスクレイピング中...`);
      await page.goto(`${BASE_URL}/line/site/show/${urlId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });
      await page.waitForTimeout(2000);

      if (isLoginPage(page)) {
        throw new CookieExpiredError('URL計測ページでログインリダイレクトを検出');
      }

      // Extract the URL name from the page heading or breadcrumb
      let urlName = '';
      try {
        // Try the page heading first
        const heading = page.locator('h1, h2, .page-header, .content-header').first();
        urlName = (await heading.innerText({ timeout: 5000 })).trim();
      } catch {
        urlName = `URL ${urlId}`;
      }

      // Scrape metrics: 総クリック数, 訪問人数, クリック率
      // These are typically displayed as label-value pairs on the detail page
      let totalClicks = 0;
      let uniqueVisitors = 0;
      let clickRate = 0;

      // Strategy: look for text content matching known labels
      const pageText = await page.locator('body').innerText();

      // 総クリック数
      const clickMatch = pageText.match(/総クリック数[\s\S]*?(\d[\d,]*)/);
      if (clickMatch) {
        totalClicks = parseNumber(clickMatch[1]);
      }

      // 訪問人数
      const visitorMatch = pageText.match(/訪問人数[\s\S]*?(\d[\d,]*)/);
      if (visitorMatch) {
        uniqueVisitors = parseNumber(visitorMatch[1]);
      }

      // クリック率
      const rateMatch = pageText.match(/クリック率[\s\S]*?([\d.]+)[%％]/);
      if (rateMatch) {
        clickRate = Number.parseFloat(rateMatch[1]);
        if (!Number.isFinite(clickRate)) clickRate = 0;
      }

      results.push({
        urlId,
        urlName,
        totalClicks,
        uniqueVisitors,
        clickRate,
      });
    } catch (err) {
      if (err instanceof CookieExpiredError) throw err;
      console.warn(`URL ${urlId} のスクレイピングに失敗:`, err);
    }
  }

  console.log(`URLメトリクススクレイピング完了: ${results.length}/${urlIds.length} 件取得`);
  return results;
}

// ---------------------------------------------------------------------------
// Collect URL IDs from magazine page
// ---------------------------------------------------------------------------

async function collectUrlIdsFromMagazinePage(page: Page): Promise<string[]> {
  // Navigate to magazine page if not already there
  if (!page.url().includes('/line/magazine')) {
    await page.goto(`${BASE_URL}/line/magazine`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(2000);
  }

  const urlIds = new Set<string>();

  // Collect all links matching /line/site/show/{id}
  const siteLinks = page.locator('a[href*="/line/site/show/"]');
  const count = await siteLinks.count();

  for (let i = 0; i < count; i++) {
    const href = await siteLinks.nth(i).getAttribute('href');
    if (href) {
      const m = href.match(/\/line\/site\/show\/(\d+)/);
      if (m) {
        urlIds.add(m[1]);
      }
    }
  }

  console.log(`magazine ページから URL ID ${urlIds.size} 件を収集`);
  return Array.from(urlIds);
}

// ---------------------------------------------------------------------------
// Function 3: scrapeTagCounts — tag page scraping
// ---------------------------------------------------------------------------

export async function scrapeTagCounts(
  page: Page,
  folderName = '3月ローンチ',
): Promise<ScrapedTagMetric[]> {
  const results: ScrapedTagMetric[] = [];

  console.log(`タグ計測: ${folderName} フォルダをスクレイピング中...`);

  await page.goto(`${BASE_URL}/line/tag`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(2000);

  if (isLoginPage(page)) {
    throw new CookieExpiredError('タグページでログインリダイレクトを検出');
  }

  // Click on the target folder (use text= locator for exact match on SPAN)
  const folderLink = page.locator(`text=${folderName}`).first();
  const folderExists = await folderLink.count();

  if (folderExists === 0) {
    console.warn(`タグフォルダ「${folderName}」が見つかりません`);
    return results;
  }

  try {
    await folderLink.click({ timeout: 5000 });
    await page.waitForTimeout(2000);
  } catch {
    console.warn(`タグフォルダ「${folderName}」のクリックに失敗`);
    return results;
  }

  // Scrape tag rows from the table
  const rows = page.locator('tbody tr');
  const rowCount = await rows.count();

  for (let i = 0; i < rowCount; i++) {
    try {
      const row = rows.nth(i);
      const cells = row.locator('td');
      const cellCount = await cells.count();
      if (cellCount < 2) continue;

      // Tag name is typically in the first or second cell
      const rowText = (await row.innerText()).trim();

      // Look for tag name pattern and friend count
      // Tag rows usually show: [checkbox] [tag name] [friend count]人
      // Extract tag name: look for text that looks like a tag name (contains 3M: or similar)
      let tagName = '';
      let friendCount = 0;

      for (let c = 0; c < cellCount; c++) {
        const cellText = (await cells.nth(c).innerText()).trim();

        // Find tag name (contains : or is non-numeric text)
        if (cellText.includes(':') || cellText.includes('：')) {
          tagName = cellText.replace(/\n/g, ' ').trim();
        }

        // Find friend count (N人 pattern)
        const countMatch = cellText.match(/(\d[\d,]*)人/);
        if (countMatch) {
          friendCount = parseNumber(countMatch[1]);
        }
      }

      // Fallback: try extracting from full row text
      if (!tagName) {
        const nameMatch = rowText.match(/(3M[：:].+?)[\s\n]/);
        if (nameMatch) {
          tagName = nameMatch[1].trim();
        }
      }
      if (friendCount === 0 && !tagName) {
        const countMatch = rowText.match(/(\d[\d,]*)人/);
        if (countMatch) friendCount = parseNumber(countMatch[1]);
      }

      if (tagName) {
        results.push({ tagName, friendCount });
      }
    } catch {
      // Non-fatal: skip row
    }
  }

  console.log(`タグスクレイピング完了: ${results.length} 件取得`);
  return results;
}

// ---------------------------------------------------------------------------
// Function 4: runBroadcastScrape — high-level orchestrator
// ---------------------------------------------------------------------------

export async function runBroadcastScrape(
  storage: Storage,
  config: LstepConfig,
): Promise<{ broadcasts: ScrapedBroadcast[]; urlMetrics: ScrapedUrlMetric[]; tagMetrics: ScrapedTagMetric[] }> {
  let browser: Browser | null = null;
  const workspaceDir = await mkdtemp(join(tmpdir(), 'lstep-msg-'));
  const storageStatePath = join(workspaceDir, 'storage-state.json');

  // 1. Download storageState from GCS
  const storageStateExists = await downloadObjectToFile(
    storage,
    config.gcsBucket,
    config.storageStateObject,
    storageStatePath,
  );

  if (!storageStateExists) {
    throw new MissingStorageStateError('GCSに保存されたCookie情報が見つかりませんでした');
  }

  try {
    // 2. Launch browser
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      storageState: storageStatePath,
    });

    const page = await context.newPage();
    page.setDefaultTimeout(180000);

    // 3. Navigate to Lstep and check for login redirect
    await page.goto(`${BASE_URL}/`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    if (isLoginPage(page)) {
      throw new CookieExpiredError('Lstepのログインページへリダイレクトされました');
    }

    // 4. Scrape broadcast list
    const broadcasts = await scrapeBroadcasts(page);

    // 5. Collect URL IDs from the magazine page
    const urlIds = await collectUrlIdsFromMagazinePage(page);

    // 6. Scrape URL metrics
    const urlMetrics = urlIds.length > 0
      ? await scrapeUrlMetrics(page, urlIds)
      : [];

    // 6.5. Scrape tag metrics
    let tagMetrics: ScrapedTagMetric[] = [];
    try {
      tagMetrics = await scrapeTagCounts(page);
    } catch (err) {
      if (err instanceof CookieExpiredError) throw err;
      console.warn('タグスクレイピングに失敗（非致命的）:', err);
    }

    // 7. Save updated storageState to GCS
    await context.storageState({ path: storageStatePath });
    await uploadFileToGcs(
      storage,
      config.gcsBucket,
      storageStatePath,
      config.storageStateObject,
    );

    await context.close();

    return { broadcasts, urlMetrics, tagMetrics };
  } catch (error) {
    if (error instanceof CookieExpiredError || error instanceof MissingStorageStateError) {
      throw error;
    }
    throw new ScrapeFailedError('一斉配信スクレイピング処理が失敗しました', { cause: error });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
