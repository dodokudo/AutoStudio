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

    // まずログイン後のダッシュボードに移動
    await page.goto('https://manager.linestep.net/', { waitUntil: 'networkidle' });

    if (isLoginPage(page)) {
      throw new CookieExpiredError('Lstepのログインページへリダイレクトされました');
    }

    // サイドバーから友だちリストに移動
    try {
      await page.click('text=友だちリスト', { timeout: 10000 });
      await page.waitForLoadState('networkidle');
    } catch (error) {
      // 別の方法で友だちリストに移動を試行
      await page.click('text=1対1トーク', { timeout: 5000 });
      await page.waitForTimeout(1000);
      await page.click('text=友だちリスト', { timeout: 5000 });
      await page.waitForLoadState('networkidle');
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
  // 1. 友だちリストページで待機
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  // 2. 複数回スクロールして確実に最下部に到達
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
  }

  // 3. デバッグ: ページの内容を確認
  console.log('Current URL:', page.url());
  console.log('Page title:', await page.title());

  // ページに存在するテキストを確認
  const bodyText = await page.locator('body').textContent();
  if (bodyText?.includes('CSV')) {
    console.log('CSV text found in page');
  } else {
    console.log('CSV text NOT found in page');
    console.log('Body contains:', bodyText?.substring(0, 500));
  }

  // より柔軟な方法で「CSV操作」を探す
  await clickByMultipleSelectors(page, [
    'text=CSV操作',
    'text=CSV操作',  // 全角・半角の違い
    'text="CSV操作"',
    ':text("CSV")',
    'button:has-text("CSV")',
    'a:has-text("CSV")',
    '[href*="csv"], [onclick*="csv"], [class*="csv"]'
  ], config.downloadTimeoutMs);

  // 4. 「CVSエクスポート」をクリック
  await clickByText(page, 'CVSエクスポート', config.downloadTimeoutMs);

  // 5. 「履歴・お気に入りから表示条件入力」をクリック
  await clickByText(page, '履歴・お気に入りから表示条件入力', config.downloadTimeoutMs);

  // 6. お気に入りの1番上の「表示項目をコピーして利用」をタップ
  await clickByText(page, '表示項目をコピーして利用', config.downloadTimeoutMs);

  // 7. 「この条件でダウンロード」をクリック
  await clickByText(page, 'この条件でダウンロード', config.downloadTimeoutMs);

  // 8. 画面をリロード
  await page.waitForLoadState('networkidle');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000); // リロード後の待機時間を増加

  // 9. エクスポート履歴の1番上のダウンロードボタンをタップ
  const downloadPromise = page.waitForEvent('download', { timeout: config.downloadTimeoutMs });
  await clickByText(page, 'ダウンロード', config.downloadTimeoutMs);
  return downloadPromise;
}

async function clickByText(page: Page, text: string, timeout: number): Promise<void> {
  const locator = page.locator(`text=${text}`);
  await locator.first().waitFor({ state: 'visible', timeout });
  await locator.first().click();
}

async function clickByMultipleSelectors(page: Page, selectors: string[], timeout: number): Promise<void> {
  let lastError: Error | null = null;

  for (const selector of selectors) {
    try {
      const locator = page.locator(selector);
      await locator.first().waitFor({ state: 'visible', timeout: 5000 });
      await locator.first().click();
      return; // 成功したら終了
    } catch (error) {
      lastError = error as Error;
      continue; // 次のセレクタを試す
    }
  }

  // すべて失敗した場合
  throw lastError || new Error('No selectors matched');
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
