import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Browser, chromium, Download, Page } from 'playwright';
import { Storage } from '@google-cloud/storage';
import { LstepConfig } from './config';
import { downloadObjectToFile } from './gcs';
import { CookieExpiredError, DownloadFailedError, MissingStorageStateError } from './errors';

interface DownloadOutcome {
  csvPath: string;
  storageStatePath: string;
  workspaceDir: string;
}

export async function downloadLstepCsv(storage: Storage, config: LstepConfig): Promise<DownloadOutcome> {
  let browser: Browser | null = null;
  const workspaceDir = await mkdtemp(join(tmpdir(), 'lstep-'));
  const storageStatePath = join(workspaceDir, 'storage-state.json');

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
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      storageState: storageStatePath,
      acceptDownloads: true,
    });

    const page = await context.newPage();
    await page.goto(config.friendsUrl, { waitUntil: 'networkidle' });

    if (isLoginPage(page)) {
      throw new CookieExpiredError('Lstepのログインページへリダイレクトされました');
    }

    const download = await performDownloadFlow(page, config);
    const suggestedName = sanitizeFilename(download.suggestedFilename()) ?? `lstep_friends_${Date.now()}.csv`;
    const csvPath = join(workspaceDir, suggestedName);
    await download.saveAs(csvPath);

    await context.storageState({ path: storageStatePath });
    await context.close();

    return {
      csvPath,
      storageStatePath,
      workspaceDir,
    };
  } catch (error) {
    if (error instanceof CookieExpiredError || error instanceof MissingStorageStateError) {
      throw error;
    }
    throw new DownloadFailedError('CSVダウンロード処理が失敗しました', { cause: error });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

function isLoginPage(page: Page): boolean {
  const url = page.url();
  if (url.includes('/account/login')) {
    return true;
  }
  return false;
}

async function performDownloadFlow(page: Page, config: LstepConfig): Promise<Download> {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);

  await clickByText(page, 'CSV操作', config.downloadTimeoutMs);
  await clickByText(page, 'CSVエクスポート', config.downloadTimeoutMs);
  await clickByText(page, '履歴・お気に入りから表示条件入力', config.downloadTimeoutMs);
  await clickByText(page, '表示項目をコピーして利用', config.downloadTimeoutMs);
  await clickByText(page, 'この条件でダウンロード', config.downloadTimeoutMs);

  await page.waitForLoadState('networkidle');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const downloadPromise = page.waitForEvent('download', { timeout: config.downloadTimeoutMs });
  await clickByText(page, 'ダウンロード', config.downloadTimeoutMs);
  return downloadPromise;
}

async function clickByText(page: Page, text: string, timeout: number): Promise<void> {
  const locator = page.locator(`text=${text}`);
  await locator.first().waitFor({ state: 'visible', timeout });
  await locator.first().click();
}

function sanitizeFilename(filename: string | null): string | null {
  if (!filename) {
    return null;
  }
  return filename.replace(/[\\/:*?"<>|]+/g, '_');
}

export async function cleanupWorkspace(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}
