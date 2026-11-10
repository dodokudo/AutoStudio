import assert from 'node:assert/strict';
import test from 'node:test';
import { bankBalanceIssue, expenseIsAvailable } from './moneyforward-health';

const now = new Date('2026-11-10T06:00:00+09:00');
const balance = { bank: 'GMO', amount: 3429939, status: 'ok', updatedAt: '2026-11-10T04:00:00' };
const sync = '2026-11-09T19:05:00Z';

test('requires both completed transaction persistence and a successful bank refresh after the report day', () => {
  assert.equal(expenseIsAvailable('2026-11-09', sync, [balance], now), true);
  for (const syncedAt of [null, 'invalid', '2026-11-06T20:54:00Z', '2026-11-11T00:00:00Z']) {
    assert.equal(expenseIsAvailable('2026-11-09', syncedAt, [balance], now), false);
  }
  for (const updatedAt of [null, 'invalid', '2026-11-07T05:51:00', '2026-11-09T23:59:00']) {
    assert.equal(expenseIsAvailable('2026-11-09', sync, [{ ...balance, updatedAt }], now), false);
  }
  assert.equal(expenseIsAvailable('2026-11-09', sync, [{ ...balance, status: 'error' }], now), false);
  assert.equal(expenseIsAvailable('2026-11-09', sync, [], now), false);
  assert.equal(expenseIsAvailable('2026-11-09', sync, null, now), false);
});

test('distinguishes zero balances, missing values and stale timestamps in JST', () => {
  assert.equal(bankBalanceIssue({ ...balance, amount: 0 }, now), null);
  assert.equal(bankBalanceIssue({ ...balance, amount: null }, now), '未取得');
  assert.equal(bankBalanceIssue({ ...balance, updatedAt: '2026-11-07T05:51:00' }, now), '更新停止');
  assert.equal(bankBalanceIssue({ ...balance, updatedAt: '2026-11-09T19:00:00Z' }, now), null);
});
