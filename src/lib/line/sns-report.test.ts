import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDailyReport } from './sns-report';
import type { DailyReportData } from './sns-report-data';

const report: DailyReportData = {
  reportDate: '2026-09-16', lineDelta: 4,
  thFollowers: 100, thFollowerDelta: 1, thPostCount: 1, thImpressions: 100,
  thProfileClicks: 1, thLinkClicks: 1, thLineRegistrations: 1,
  igFollowers: 100, igFollowerDelta: 1, igPostCount: 1, igReach: 100,
  igLinkClicks: 1, igLineRegistrations: 1, igStoryCount: 1,
  igStoryViews: 10, igStoryViewRate: 10, mfExpense: 1234,
  mfBankBalances: [
    { bank: 'GMOあおぞらネット銀行', amount: 20000, updatedAt: '2026-09-17T03:53:00', status: 'ok' },
    { bank: '楽天銀行', amount: 0, updatedAt: '2026-09-16T03:53:00', status: 'ok' },
  ],
};

test('keeps daily spending and shows each bank including zero with its own update time', () => {
  const message = formatDailyReport(report);
  assert.match(message, /💰 支出\n- 合計：¥1,234/);
  assert.match(message, /GMOあおぞらネット銀行：¥20,000\n  更新：2026\/09\/17 03:53/);
  assert.match(message, /楽天銀行：¥0\n  更新：2026\/09\/16 03:53/);
  assert.match(message, /- 合計：¥20,000/);
});

test('does not present missing balances as zero or calculate an incomplete total', () => {
  const message = formatDailyReport({ ...report, mfBankBalances: [
    report.mfBankBalances![0],
    { bank: '楽天銀行', amount: null, updatedAt: null, status: null },
  ] });
  assert.match(message, /楽天銀行：未取得/);
  assert.match(message, /日時不明／連携エラー・要確認/);
  assert.match(message, /合計：一部の口座残高が未取得/);
  assert.doesNotMatch(message, /- 合計：¥20,000/);
});

test('flags cached balances when bank synchronization failed', () => {
  const message = formatDailyReport({ ...report, mfBankBalances: [
    { ...report.mfBankBalances![0], status: 'error' },
  ] });
  assert.match(message, /更新：2026\/09\/17 03:53（日本時間）／連携エラー・要確認/);
});

test('a balance query failure preserves spending and the rest of the report', () => {
  for (const mfBankBalances of [null, []]) {
    const message = formatDailyReport({ ...report, mfBankBalances });
    assert.match(message, /残高を取得できませんでした/);
    assert.match(message, /💰 支出\n- 合計：¥1,234/);
    assert.match(message, /💻 Threads/);
  }
});
