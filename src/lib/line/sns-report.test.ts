import assert from 'node:assert/strict';
import test from 'node:test';
import { formatDailyReport, formatWeeklyReport } from './sns-report';
import type { DailyReportData, WeeklyReportData } from './sns-report-data';

const report: DailyReportData = {
  reportDate: '2026-09-16', lineDelta: 4,
  thFollowers: 100, thFollowerDelta: 1, thPostCount: 1, thImpressions: 100,
  thLinkClicks: 1, thLineRegistrations: 1,
  igFollowers: 100, igFollowerDelta: 1, igPostCount: 1, igReach: 100,
  igLinkClicks: 1, igLineRegistrations: 1, igStoryCount: 1,
  igCollectedAt: '2026-09-16T15:05:00Z', igStoryReach: 10, igStoryViewRate: 10, mfExpense: 1234,
  mfBankBalances: [
    { bank: 'GMOあおぞらネット銀行', amount: 20000, updatedAt: '2026-09-17T03:53:00', status: 'ok' },
    { bank: '楽天銀行', amount: 0, updatedAt: '2026-09-16T03:53:00', status: 'ok' },
  ],
};

test('keeps daily spending and shows short bank names without update timestamps', () => {
  const message = formatDailyReport(report);
  assert.match(message, /💰 支出\n- 合計：¥1,234/);
  assert.match(message, /GMO：¥20,000/);
  assert.match(message, /楽天：¥0/);
  assert.doesNotMatch(message, /更新：|日本時間|GMOあおぞらネット銀行|楽天銀行|最新の連携データ/);
  assert.match(message, /- 合計：¥20,000/);
});

test('does not present missing balances as zero or calculate an incomplete total', () => {
  const message = formatDailyReport({ ...report, mfBankBalances: [
    report.mfBankBalances![0],
    { bank: '楽天銀行', amount: null, updatedAt: null, status: null },
  ] });
  assert.match(message, /楽天：未取得/);
  assert.match(message, /合計：一部の口座残高が未取得/);
  assert.doesNotMatch(message, /- 合計：¥20,000/);
});

test('flags cached balances when bank synchronization failed', () => {
  const message = formatDailyReport({ ...report, mfBankBalances: [
    { ...report.mfBankBalances![0], status: 'error' },
  ] });
  assert.match(message, /GMO：¥20,000（連携エラー）/);
});

test('a balance query failure preserves spending and the rest of the report', () => {
  for (const mfBankBalances of [null, []]) {
    const message = formatDailyReport({ ...report, mfBankBalances });
    assert.match(message, /残高を取得できませんでした/);
    assert.match(message, /💰 支出\n- 合計：¥1,234/);
    assert.match(message, /💻 Threads/);
  }
});

test('missing Instagram values remain unknown and never trigger a false story warning', () => {
  const message = formatDailyReport({ ...report,
    igFollowers: null, igFollowerDelta: null, igPostCount: null, igReach: null,
    igLinkClicks: null, igStoryCount: 0, igStoryReach: null, igStoryViewRate: null, igCollectedAt: null,
  });
  assert.match(message, /フォロワー数：未取得（未取得）/);
  assert.match(message, /リーチ：未取得/);
  assert.match(message, /プロフィールリンクタップ：未取得/);
  assert.match(message, /投稿数：取得記録なし/);
  assert.doesNotMatch(message, /ストーリー投稿がありません|未取得%|null|NaN/);
});

test('uses main-account views and names each measurement accurately', () => {
  const message = formatDailyReport({ ...report, thFollowers: 6955, thFollowerDelta: 21,
    thImpressions: 12383, igFollowers: 1082, igFollowerDelta: -2, igLinkClicks: 0,
  });
  assert.match(message, /Threads（メイン）/);
  assert.match(message, /6,955（\+21）/);
  assert.match(message, /閲覧数：12,383/);
  assert.match(message, /1,082（-2）/);
  assert.match(message, /プロフィールリンクタップ：0/);
  assert.doesNotMatch(message, /直近24時間|取得日時|保存済み投稿|1投稿平均/);
  assert.match(message, /ストーリー\n- 投稿数：1\n- リーチ：10\n- 閲覧率：10%/);
  assert.doesNotMatch(message, /プロフクリック|インプレッション/);
});

test('shows combined Threads LINE registrations independently of main-account metrics', () => {
  const message = formatDailyReport({ ...report, thLineRegistrations: 7 });
  assert.match(message, /Threads（メイン）[\s\S]*?LINE登録数：7/);
  assert.doesNotMatch(message, /未判別|メイン専用/);
});

const weekly: WeeklyReportData = {
  ...report, weekStart: '2026-09-07', weekEnd: '2026-09-13',
  thFollowersWeekEnd: 100, igFollowersWeekEnd: 100, mfWeekExpense: 1234,
  monthLabel: '2026-09', monthLineDelta: 4, monthThFollowerDelta: 1,
  monthThPostCount: 1, monthThImpressions: 100, monthIgFollowerDelta: 1,
  monthIgReach: 100, monthMfExpense: 1234, lastMonthLabel: '2026-08',
  lastMonthLineDelta: 4, lastMonthThFollowerDelta: 1, lastMonthIgFollowerDelta: 1,
  lastMonthMfExpense: 1234,
};

test('weekly story labels match daily and omit removed annotations', () => {
  const message = formatWeeklyReport(weekly);
  assert.match(message, /ストーリー\n- 投稿数：1\n- リーチ：10\n- 閲覧率：10%/);
  assert.doesNotMatch(message, /直近24時間|取得日時|保存済み投稿|累積閲覧数|1投稿平均/);
  const missing = formatWeeklyReport({ ...weekly, igStoryReach: null, igStoryViewRate: null });
  assert.match(missing, /閲覧率：未取得/);
  assert.doesNotMatch(missing, /null|NaN|未取得%/);
});
