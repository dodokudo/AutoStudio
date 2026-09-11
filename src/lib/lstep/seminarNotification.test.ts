import assert from 'node:assert/strict';
import test from 'node:test';
import { seminarNotificationKey, seminarNotificationText, notifySeminarSchedule } from './seminarNotification';
import type { RunResult } from './seminarSlotRunner';
const result: RunResult = { ranAt: '2026-09-12T10:00:00Z', launchId: '2026-09-auto', executionId: 'execution-1', mode: 'apply', steps: [], issues: [] };
test('9時・12時・19時の通知を別実行として扱い、同一実行の再送だけをまとめる', () => {
  assert.equal(seminarNotificationKey(result), seminarNotificationKey({ ...result, ranAt: '2026-09-12T10:10:00Z' }));
  assert.notEqual(seminarNotificationKey(result), seminarNotificationKey({ ...result, executionId: 'execution-2' }));
  assert.match(seminarNotificationText(result), /19:00:00 JST/);
  assert.match(seminarNotificationText(result), /2026-09-auto/);
});
test('LINEに実際の実行ID由来の再送キーを渡し、APIエラーを成功にしない', async (t) => {
  const oldToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const oldTarget = process.env.LSTEP_SEMINAR_REPORT_TARGET_ID;
  process.env.LINE_CHANNEL_ACCESS_TOKEN = 'test';
  process.env.LSTEP_SEMINAR_REPORT_TARGET_ID = 'test-owner';
  t.after(() => {
    if (oldToken === undefined) delete process.env.LINE_CHANNEL_ACCESS_TOKEN; else process.env.LINE_CHANNEL_ACCESS_TOKEN = oldToken;
    if (oldTarget === undefined) delete process.env.LSTEP_SEMINAR_REPORT_TARGET_ID; else process.env.LSTEP_SEMINAR_REPORT_TARGET_ID = oldTarget;
  });
  t.mock.method(globalThis, 'fetch', async (_url: unknown, request: RequestInit) => {
    const payload = JSON.parse(String(request.body));
    assert.equal(payload.to, 'test-owner');
    assert.match((request.headers as Record<string,string>)['X-Line-Retry-Key'], /^[0-9a-f-]{36}$/);
    return new Response('unauthorized', { status: 401 });
  });
  await assert.rejects(notifySeminarSchedule(result), /401/);
});
