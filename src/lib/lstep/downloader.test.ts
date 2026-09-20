import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import {
  isSessionExpired,
  navigateToFriendsPage,
  selectExportFavorite,
} from './downloader';

test('opens the configured friends URL without relying on dashboard clicks', async () => {
  const calls: Array<{ url: string; timeout?: number }> = [];
  const page = {
    goto: async (url: string, options?: { timeout?: number }) => {
      calls.push({ url, timeout: options?.timeout });
    },
    waitForTimeout: async () => undefined,
  } as unknown as Parameters<typeof navigateToFriendsPage>[0];

  await navigateToFriendsPage(page, 'https://manager.linestep.net/line/show');

  assert.deepEqual(calls, [
    { url: 'https://manager.linestep.net/line/show', timeout: 60_000 },
  ]);
});

test('does not treat a changed friends-page layout as an expired session', async () => {
  const page = {
    url: () => 'https://manager.linestep.net/line/show',
    locator: () => ({ count: async () => 0 }),
  } as unknown as Parameters<typeof isSessionExpired>[0];

  assert.equal(await isSessionExpired(page), false);
});

test('detects the actual login page as an expired session', async () => {
  const page = {
    url: () => 'https://manager.linestep.net/account/login',
  } as unknown as Parameters<typeof isSessionExpired>[0];

  assert.equal(await isSessionExpired(page), true);
});

test('selects the named export favorite instead of the first row', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());
  const page = await browser.newPage();

  await page.setContent(`
    <table>
      <tr>
        <td>古い設定</td>
        <td><a href="#old">表示項目をコピーして利用</a></td>
      </tr>
      <tr>
        <td>Threads 分析よう</td>
        <td><a href="#threads">表示項目をコピーして利用</a></td>
      </tr>
    </table>
  `);

  await selectExportFavorite(page, 'Threads 分析よう');

  assert.equal(new URL(page.url()).hash, '#threads');
});

test('fails when the configured export favorite is missing', async (t) => {
  const browser = await chromium.launch({ headless: true });
  t.after(async () => browser.close());
  const page = await browser.newPage();

  await page.setContent(`
    <table>
      <tr>
        <td>古い設定</td>
        <td><a href="#old">表示項目をコピーして利用</a></td>
      </tr>
    </table>
  `);

  await assert.rejects(
    selectExportFavorite(page, 'Threads 分析よう'),
    /お気に入り「Threads 分析よう」が見つかりませんでした/,
  );
});
