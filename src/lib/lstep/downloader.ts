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
    page.setDefaultTimeout(180000); // 3分

    // まずログイン後のダッシュボードに移動
    await page.goto('https://manager.linestep.net/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    if (isLoginPage(page)) {
      throw new CookieExpiredError('Lstepのログインページへリダイレクトされました');
    }

    // サイドバーから友だちリストに移動
    try {
      await page.click('text=友だちリスト', { timeout: 10000 });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
    } catch {
      // 別の方法で友だちリストに移動を試行
      await page.click('text=1対1トーク', { timeout: 5000 });
      await page.waitForTimeout(1000);
      await page.click('text=友だちリスト', { timeout: 5000 });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
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

  // 2. 「CSV操作」タブが表示されるまでスクロール
  let csvButtonVisible = false;
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    const csvButton = page.locator('text=CSV操作');
    const count = await csvButton.count();
    if (count > 0) {
      try {
        await csvButton.first().waitFor({ state: 'visible', timeout: 1000 });
        csvButtonVisible = true;
        break;
      } catch {
        // まだ見えていない
      }
    }
  }

  if (!csvButtonVisible) {
    throw new Error('CSV操作タブが見つかりませんでした');
  }

  // 3. CSV操作タブをクリック
  console.log('CSV操作タブをクリック...');
  await page.getByRole('tab', { name: 'CSV操作' }).click();
  await page.waitForTimeout(2000);

  // 4. CSVエクスポートボタンをクリック（ID: csv_export_mover）
  console.log('CSVエクスポートボタンをクリック...');
  await page.locator('#csv_export_mover').click();

  // ページ遷移を待つ（/line/exporter/.../register に遷移）
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
  console.log('CSVエクスポートページに遷移しました:', page.url());

  // 5. 「履歴・お気に入りから表示条件入力」タブをクリック
  console.log('履歴・お気に入りから表示条件入力をクリック...');
  await page.getByRole('link', { name: '履歴・お気に入りから表示条件入力' }).click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
  console.log('エクスポートリストページに遷移しました:', page.url());

  // 6. お気に入りの1番上（「表示項目をコピーして利用」リンク）をクリック
  console.log('お気に入りの1番上（表示項目をコピーして利用）をクリック...');
  await page.getByRole('link', { name: '表示項目をコピーして利用' }).first().click();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
  console.log('CSVエクスポート設定ページに戻りました:', page.url());

  // 7. 「この条件でダウンロード」をクリック
  console.log('この条件でダウンロードをクリック...');
  await page.getByRole('button', { name: 'この条件でダウンロード' }).click();

  // 8. 画面をリロード（エクスポート履歴を更新）
  console.log('ページをリロードしています...');
  await page.waitForLoadState('domcontentloaded');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  console.log('リロード完了');

  // 9. エクスポート履歴の1番上のダウンロードボタンをクリック
  console.log('ダウンロードボタンをクリック...');
  const downloadPromise = page.waitForEvent('download', { timeout: config.downloadTimeoutMs });
  await page.getByRole('link', { name: 'ダウンロード' }).first().click();
  console.log('ダウンロード開始...');
  return downloadPromise;
}

async function clickByText(page: Page, text: string, timeout: number): Promise<void> {
  const locator = page.locator(`text=${text}`);
  await locator.first().waitFor({ state: 'visible', timeout });
  await locator.first().click();
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function clickByMultipleSelectors(page: Page, selectors: string[], _timeout: number): Promise<void> {
  let lastError: Error | null = null;

  for (const selector of selectors) {
    try {
      const locator = page.locator(selector);
      const count = await locator.count();
      if (count > 0) {
        await locator.first().waitFor({ state: 'visible', timeout: 5000 });
        await locator.first().click();
        return; // 成功したら終了
      }
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
