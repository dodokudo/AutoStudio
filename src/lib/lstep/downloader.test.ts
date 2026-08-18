import assert from 'node:assert/strict';
import test from 'node:test';
import { navigateToFriendsPage } from './downloader';

test('opens the configured friends URL without relying on dashboard clicks', async () => {
  const calls: Array<{ url: string; timeout?: number }> = [];
  const page = {
    goto: async (url: string, options?: { timeout?: number }) => {
      calls.push({ url, timeout: options?.timeout });
    },
    waitForTimeout: async () => undefined,
  } as unknown as Parameters<typeof navigateToFriendsPage>[0];

  await navigateToFriendsPage(page, 'https://manager.linestep.net/friends');

  assert.deepEqual(calls, [
    { url: 'https://manager.linestep.net/friends', timeout: 60_000 },
  ]);
});
