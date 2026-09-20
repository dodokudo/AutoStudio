import assert from 'node:assert/strict';
import test from 'node:test';
import { isSessionExpired, navigateToFriendsPage } from './downloader';

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
