import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from './route';

test('import fails closed and rejects bad input before accessing BigQuery', async () => {
  const originalKey = process.env.THREADS_INSIGHTS_INGEST_KEY;
  const originalEnabled = process.env.THREADS_SUPPLEMENTAL_INSIGHTS_ENABLED;
  const key = 'test-only-key-with-more-than-32-characters';
  const request = (body: string, headers: Record<string, string> = {}) => new Request('http://localhost/api/threads/insights/import', {
    method: 'POST', headers, body,
  });
  try {
    delete process.env.THREADS_INSIGHTS_INGEST_KEY;
    process.env.THREADS_SUPPLEMENTAL_INSIGHTS_ENABLED = 'true';
    assert.equal((await POST(request('{}'))).status, 503);
    process.env.THREADS_INSIGHTS_INGEST_KEY = key;
    assert.equal((await POST(request('{}'))).status, 401);
    assert.equal((await POST(request('{}', { 'x-threads-insights-key': 'incorrect' }))).status, 401);
    const auth = { 'x-threads-insights-key': key };
    assert.equal((await POST(request('{}', auth))).status, 415);
    const json = { ...auth, 'content-type': 'application/json' };
    assert.equal((await POST(request('{', json))).status, 400);
    assert.equal((await POST(request('{}', json))).status, 400);
    assert.equal((await POST(request(' '.repeat(256 * 1024 + 1), json))).status, 413);
    process.env.THREADS_SUPPLEMENTAL_INSIGHTS_ENABLED = 'false';
    assert.equal((await POST(request('{}', json))).status, 503);
  } finally {
    if (originalKey === undefined) delete process.env.THREADS_INSIGHTS_INGEST_KEY;
    else process.env.THREADS_INSIGHTS_INGEST_KEY = originalKey;
    if (originalEnabled === undefined) delete process.env.THREADS_SUPPLEMENTAL_INSIGHTS_ENABLED;
    else process.env.THREADS_SUPPLEMENTAL_INSIGHTS_ENABLED = originalEnabled;
  }
});
