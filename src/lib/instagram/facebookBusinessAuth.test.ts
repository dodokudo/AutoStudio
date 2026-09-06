import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getCompetitorFacebookContext,
  shouldExchangeFacebookToken,
} from './facebookBusinessAuth';

test('exchanges a Facebook token when it expires within seven days', () => {
  const now = new Date('2026-09-07T00:00:00.000Z');
  const expiresAt = Math.floor(new Date('2026-09-10T00:00:00.000Z').getTime() / 1000);
  assert.equal(shouldExchangeFacebookToken({ expires_at: expiresAt }, now), true);
});

test('does not exchange a non-expiring long-lived Facebook token', () => {
  const now = new Date('2026-09-07T00:00:00.000Z');
  assert.equal(shouldExchangeFacebookToken({ expires_at: 0 }, now), false);
});

test('does not exchange a Facebook token with more than seven days remaining', () => {
  const now = new Date('2026-09-07T00:00:00.000Z');
  const expiresAt = Math.floor(new Date('2026-10-07T00:00:00.000Z').getTime() / 1000);
  assert.equal(shouldExchangeFacebookToken({ expires_at: expiresAt }, now), false);
});

test('exchanges an expiring token, persists it and returns the linked Page token', async () => {
  const original = {
    appId: process.env.IG_COMPETITOR_FB_APP_ID,
    appSecret: process.env.IG_COMPETITOR_FB_APP_SECRET,
    sourceUsername: process.env.IG_COMPETITOR_SOURCE_USERNAME,
    token: process.env.IG_COMPETITOR_FB_ACCESS_TOKEN,
  };
  process.env.IG_COMPETITOR_FB_APP_ID = 'app-1';
  process.env.IG_COMPETITOR_FB_APP_SECRET = 'secret-1';
  process.env.IG_COMPETITOR_SOURCE_USERNAME = 'kudooo_ai';
  process.env.IG_COMPETITOR_FB_ACCESS_TOKEN = 'short-token';

  const persisted: string[] = [];
  const requests: string[] = [];
  const fetchImpl = (async (input: URL | RequestInfo) => {
    const url = new URL(String(input));
    requests.push(url.pathname);
    if (url.pathname.endsWith('/debug_token')) {
      const isLong = url.searchParams.get('input_token') === 'long-token';
      return Response.json({
        data: {
          app_id: 'app-1',
          data_access_expires_at: 1_800_000_000,
          expires_at: isLong ? 0 : 1_788_822_400,
          is_valid: true,
          type: 'USER',
        },
      });
    }
    if (url.pathname.endsWith('/oauth/access_token')) {
      return Response.json({ access_token: 'long-token', token_type: 'bearer' });
    }
    if (url.pathname.endsWith('/me/accounts')) {
      assert.equal(url.searchParams.get('access_token'), 'long-token');
      return Response.json({
        data: [
          {
            access_token: 'page-token',
            id: 'page-1',
            instagram_business_account: {
              id: 'ig-1',
              name: 'Kudo',
              username: 'kudooo_ai',
            },
            name: 'Page',
          },
        ],
      });
    }
    return Response.json({ error: { code: 404, message: 'unexpected request' } }, { status: 404 });
  }) as typeof fetch;

  try {
    const context = await getCompetitorFacebookContext({
      fetchImpl,
      now: new Date('2026-09-07T00:00:00.000Z'),
      persistToken: async (token) => {
        persisted.push(token);
      },
    });
    assert.equal(context.accessToken, 'page-token');
    assert.equal(context.instagramUserId, 'ig-1');
    assert.equal(context.instagramUsername, 'kudooo_ai');
    assert.equal(context.tokenWasExchanged, true);
    assert.deepEqual(persisted, ['long-token']);
    assert.deepEqual(requests, [
      '/v26.0/debug_token',
      '/v26.0/oauth/access_token',
      '/v26.0/debug_token',
      '/v26.0/me/accounts',
    ]);
  } finally {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('IG_COMPETITOR_FB_APP_ID', original.appId);
    restore('IG_COMPETITOR_FB_APP_SECRET', original.appSecret);
    restore('IG_COMPETITOR_SOURCE_USERNAME', original.sourceUsername);
    restore('IG_COMPETITOR_FB_ACCESS_TOKEN', original.token);
  }
});
