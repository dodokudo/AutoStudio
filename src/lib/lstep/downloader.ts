import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Browser, chromium, Download, Page } from 'playwright';
import { Storage } from '@google-cloud/storage';
import { LstepConfig } from './config';
import { downloadObjectToFile, uploadFileToGcs } from './gcs';
import { CookieExpiredError, DownloadFailedError } from './errors';

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

  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const context = await browser.newContext({
      ...(storageStateExists ? { storageState: storageStatePath } : {}),
      acceptDownloads: true,
    });

    const page = await context.newPage();
    page.setDefaultTimeout(180000); // 3分

    // まずログイン後のダッシュボードに移動
    await page.goto('https://manager.linestep.net/', { waitUntil: 'domcontentloaded', timeout: 60000 });

    if (await isSessionExpired(page)) {
      await loginWithCredentials(page);
      await context.storageState({ path: storageStatePath });
      await uploadFileToGcs(
        storage,
        config.gcsBucket,
        storageStatePath,
        config.storageStateObject,
        'application/json',
      );
      console.log('Lstepへ自動再ログインし、セッションをGCSへ保存しました');
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

    // 友だちリスト画面が出ている＝ログインできている、を再確認
    if (await isSessionExpired(page)) {
      throw new CookieExpiredError('友だちリスト遷移後にログイン画面が表示されました');
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
    if (error instanceof CookieExpiredError) {
      throw error;
    }
    throw new DownloadFailedError('CSVダウンロード処理が失敗しました', { cause: error });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

async function loginWithCredentials(page: Page): Promise<void> {
  const username = process.env.LSTEP_USERNAME;
  const password = process.env.LSTEP_PASSWORD;
  if (!username || !password) {
    throw new CookieExpiredError('Lstepのセッションが切れており、自動再ログイン用の認証情報がありません');
  }

  const usernameInput = page.locator('input[type="email"]:visible,input[type="text"]:visible').first();
  const passwordInput = page.locator('input[type="password"]:visible').first();
  if (!await usernameInput.count() || !await passwordInput.count()) {
    throw new CookieExpiredError('Lstepのログイン入力欄が見つかりません');
  }

  await usernameInput.fill(username);
  await passwordInput.fill(password);

  const submit = page.locator('button[type="submit"]:visible,input[type="submit"]:visible').first();
  if (!await submit.count()) throw new CookieExpiredError('Lstepのログインボタンが見つかりません');

  const recaptcha = page.frameLocator('iframe[title="reCAPTCHA"]').getByRole('checkbox', { name: '私はロボットではありません' });
  if (await recaptcha.count()) {
    await recaptcha.click();
    await page.waitForFunction(() => {
      const button = document.querySelector('button[type="submit"],input[type="submit"]') as HTMLButtonElement | HTMLInputElement | null;
      return button !== null && !button.disabled;
    }, undefined, { timeout: 30_000 }).catch(() => undefined);
  }

  if (!await submit.isEnabled()) {
    throw new CookieExpiredError('reCAPTCHAの確認が必要なため、Lstepへ自動再ログインできませんでした');
  }

  await submit.click();
  await page.waitForURL((url) => !url.pathname.includes('/account/login'), { timeout: 60_000 });
  await page.waitForTimeout(2_000);
  if (await isSessionExpired(page)) throw new CookieExpiredError('Lstepへの自動再ログインに失敗しました');
}

function isLoginPage(page: Page): boolean {
  const url = page.url();
  if (url.includes('/account/login')) {
    return true;
  }
  return false;
}

// Cookie/セッション失効を多面的に検知する。
// Lstepはセッション切れ時に必ずしも /account/login にリダイレクトしない（空画面を返す）ため、
// URL以外にも「ログインフォームの存在」「サイドバーの存在」を併せて確認する。
async function isSessionExpired(page: Page): Promise<boolean> {
  if (isLoginPage(page)) {
    return true;
  }
  // ログインフォーム要素が見える＝ログイン画面
  const loginFormCount = await page.locator('input[type="password"], form[action*="login"]').count();
  if (loginFormCount > 0) {
    return true;
  }
  // 5秒以内にサイドバーの「友だちリスト」テキストが見つからなければセッション切れ扱い
  try {
    await page.locator('text=友だちリスト').first().waitFor({ state: 'attached', timeout: 5000 });
    return false;
  } catch {
    return true;
  }
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

  // 3. CSV操作ボタンをクリック → モーダルが開く（2026 UI更新）
  console.log('CSV操作ボタンをクリック...');
  const csvOpClicked = await tryClickByRoles(page, 'CSV操作', ['button', 'tab', 'link']);
  if (!csvOpClicked) {
    await page.locator('text=CSV操作').first().click({ timeout: 10000 });
  }
  await page.waitForTimeout(2000);

  // 4. モーダル内の「CSVエクスポートリスト」ボタンをクリック
  // 旧UI: CSV操作タブ → #csv_export_mover → 履歴・お気に入りタブ
  // 新UI: CSV操作ボタン → モーダル → 「CSVエクスポートリスト」ボタン → エクスポート履歴+お気に入り画面
  console.log('モーダル内「CSVエクスポートリスト」をクリック...');
  const exportListClicked = await tryClickByRoles(
    page,
    'CSVエクスポートリスト',
    ['button', 'link'],
  );
  if (exportListClicked) {
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2500);
    console.log('現在のURL:', page.url());
  } else {
    // 旧UIフォールバック
    const moverCount = await page.locator('#csv_export_mover').count();
    if (moverCount > 0) {
      console.log('  -> 旧UI: #csv_export_mover をクリック');
      await page.locator('#csv_export_mover').click({ timeout: 10000 });
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);
      // さらに「履歴・お気に入りから表示条件入力」へ
      const histLink = await page.getByRole('link', { name: '履歴・お気に入りから表示条件入力' }).count();
      if (histLink > 0) {
        await page.getByRole('link', { name: '履歴・お気に入りから表示条件入力' }).click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000);
      }
    } else {
      throw new Error('CSVエクスポートリストへの遷移ボタンが見つかりません');
    }
  }

  const existingDownloadHrefs = await collectDownloadHrefs(page);
  console.log(`既存のダウンロードリンク数: ${existingDownloadHrefs.length}`);

  // 6. お気に入りの1番上（「表示項目をコピーして利用」リンク or ボタン）をクリック
  console.log('お気に入りの1番上（表示項目をコピーして利用）をクリック...');
  const copyClicked = await tryClickByRoles(page, '表示項目をコピーして利用', ['link', 'button']);
  if (!copyClicked) {
    await page.locator('text=表示項目をコピーして利用').first().click({ timeout: 10000 });
  }
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);
  console.log('CSVエクスポート設定ページに戻りました:', page.url());

  // 7. 「この条件でダウンロード」をクリックする前の履歴リンクを基準にする
  const initialDownloadLinkCount = existingDownloadHrefs.length;
  const newDownloadHrefs: string[] = [];

  // 8. 「この条件でダウンロード」をクリック
  console.log('この条件でダウンロードをクリック...');
  await page.getByRole('button', { name: 'この条件でダウンロード' }).click();

  // 9. 新しいエクスポートが完了するまでポーリング（最大90秒）
  console.log('エクスポート完了を待機中...');
  await page.waitForLoadState('domcontentloaded');

  let exportReady = false;
  for (let i = 0; i < 18; i++) {
    await page.waitForTimeout(5000);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const currentDownloadHrefs = await collectDownloadHrefs(page);
    const currentHrefSet = new Set(currentDownloadHrefs);
    const newHrefs = currentDownloadHrefs.filter((href) => !existingDownloadHrefs.includes(href));
    console.log(
      `ポーリング ${i + 1}/18: ダウンロードリンク ${currentHrefSet.size}個 (既存: ${initialDownloadLinkCount}, 新規: ${newHrefs.length})`,
    );

    if (newHrefs.length > 0) {
      newDownloadHrefs.push(...newHrefs);
      exportReady = true;
      console.log('新しいエクスポート完了を確認');
      break;
    }
  }

  if (!exportReady) {
    throw new Error('エクスポートが90秒以内に完了しませんでした');
  }

  // 10. エクスポート履歴の1番上のダウンロードボタンをクリック
  console.log('ダウンロードボタンをクリック...');
  const downloadPromise = page.waitForEvent('download', { timeout: config.downloadTimeoutMs });

  // エクスポート履歴テーブルの中から今回作成されたダウンロードボタンだけを押す
  const clicked = await clickDownloadByHrefs(page, newDownloadHrefs);
  if (!clicked) {
    throw new Error('新規エクスポートのダウンロードボタンが見つかりませんでした');
  }
  console.log('新規エクスポートのダウンロードリンクをクリックしました');

  console.log('ダウンロード開始...');
  return downloadPromise;
}

async function collectDownloadHrefs(page: Page): Promise<string[]> {
  const hrefs = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'));
    return links
      .filter((link) => link.textContent?.includes('ダウンロード'))
      .map((link) => link.getAttribute('href'))
      .filter((href): href is string => Boolean(href));
  });

  return Array.from(new Set(hrefs));
}

async function clickDownloadByHrefs(page: Page, hrefs: string[]): Promise<boolean> {
  for (const href of hrefs) {
    const clicked = await page.evaluate((targetHref) => {
      const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a'));
      const link = links.find((candidate) => {
        const candidateHref = candidate.getAttribute('href');
        return candidateHref === targetHref && candidate.textContent?.includes('ダウンロード');
      });
      if (!link) return false;
      link.click();
      return true;
    }, href);

    if (clicked) {
      return true;
    }
  }

  return false;
}

async function tryClickByRoles(
  page: Page,
  name: string,
  roles: Array<'button' | 'tab' | 'link'>,
): Promise<boolean> {
  for (const role of roles) {
    const locator = page.getByRole(role, { name });
    const count = await locator.count();
    if (count === 0) continue;
    try {
      await locator.first().click({ timeout: 8000 });
      console.log(`  -> role=${role} でクリック成功 (${name})`);
      return true;
    } catch {
      continue;
    }
  }
  return false;
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
