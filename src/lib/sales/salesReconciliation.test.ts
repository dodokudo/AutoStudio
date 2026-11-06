import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCommission, defaultAttribution, validateAttribution } from './commissions';
import { canonicalSalesName, createSalesNameResolver, isUnknownSalesName, matchFormIdentity, parseFormIdentities } from './identity';
import { enrichSalesIdentities } from './elmeIdentities';
import { calculateGrossProfit } from './profit';
import type { UnivaPayCharge } from '../univapay/client';

const sale = { id: 'a', revenueKey: 'charge:a', amount: 110000, category: 'frontend', paymentDate: '2026-11-06' };
test('粗利は紹介・営業報酬と直接原価を差し引き、人件費や諸経費は差し引かない', () => {
  const costs = [
    { amount: 22000, expenseType: 'direct' },
    { amount: 11000, expenseType: 'direct' },
    { amount: 3960, expenseType: 'direct' },
    { amount: 50000, expenseType: 'operating' },
    { amount: 5000, expenseType: 'operating' },
  ];
  assert.equal(calculateGrossProfit(110000, costs).grossProfit, 73040);
  assert.equal(calculateGrossProfit(110000, costs).directCosts, 36960);
  assert.equal(calculateGrossProfit(0, []).grossMargin, null);
});
test('紹介20%と営業10%は同じ売上額を基準に別々に計算する', () => {
  const rule = { ...defaultAttribution(sale), referralStatus: 'assigned' as const, referrerName: '紹介者', salespersonStatus: 'assigned' as const, salespersonName: '担当者' };
  assert.deepEqual(calculateCommission(sale, rule), { referral: 22000, salesperson: 11000, total: 33000, pending: false, attribution: rule });
  const october = calculateCommission({ ...sale, paymentDate: '2026-10-31' }, rule);
  assert.equal(october.total, 22000);
  assert.equal(october.salesperson, 0);
});
test('未確認と明示的な報酬なしを区別し、10月は営業報酬を初期設定しない', () => {
  assert.equal(calculateCommission(sale).pending, true);
  const october = defaultAttribution({ ...sale, paymentDate: '2026-10-01' });
  assert.equal(october.referralStatus, 'unknown');
  assert.equal(october.salespersonStatus, 'none');
  assert.equal(defaultAttribution(sale).salespersonStatus, 'none');
  assert.equal(calculateCommission(sale, { ...defaultAttribution(sale), referralStatus: 'none', salespersonStatus: 'none' }).pending, false);
  assert.equal(validateAttribution({ ...defaultAttribution(sale), referralStatus: 'assigned', referrerName: '' }), false);
});
test('継続・成果報酬・ANALYCA・法人案件は紹介者が登録されていても報酬を計上しない', () => {
  const rule = { ...defaultAttribution(sale), referralStatus: 'assigned' as const, referrerName: '紹介者', salespersonStatus: 'assigned' as const, salespersonName: '担当者' };
  for (const category of ['backend_renewal', 'backend_performance', 'analyca', 'corporate', 'other']) {
    const result = calculateCommission({ ...sale, category }, rule);
    assert.equal(result.total, 0, category);
    assert.equal(result.pending, false, category);
  }
  assert.equal(calculateCommission({ ...sale, category: 'backend' }, rule).total, 33000);
});
test('決済ごとに計算するので分割売上を契約総額として扱わない', () => {
  const payment = { ...sale, amount: 33000 };
  assert.equal(calculateCommission(payment, { ...defaultAttribution(payment), referralStatus: 'assigned', referrerName: '紹介者', salespersonStatus: 'none' }).total, 6600);
});
const header = ['LINE ユーザーID', '回答ID', '回答日時', '回答者ID', 'LINE名', 'システム表示名', 'お名前を入力してください', 'メールアドレスを入力してください'];
test('メールの完全一致で補完し、名前や日付だけでは補完しない', () => {
  const identities = parseFormIdentities([header, ['line', '1', '', 'person1', '表示名', '', '田中 花子', ' A@EXAMPLE.COM ']]);
  assert.equal(matchFormIdentity('a@example.com', identities)?.name, '田中 花子');
  assert.equal(matchFormIdentity('other@example.com', identities), undefined);
  assert.equal(matchFormIdentity('a+other@example.com', identities), undefined);
  assert.equal(matchFormIdentity('a@example.com', [...identities, { ...identities[0], name: '田中太郎', respondentId: 'person2' }]), undefined);
  assert.throws(() => parseFormIdentities([['不正なヘッダー']]));
});
test('確認済み法人表記と逆順の名前を統一し、未確認は別扱いにする', () => {
  assert.equal(canonicalSalesName('株式会社Ｂｅ　Ｃｏｎｆｉｄｅｎｔ　伊藤　沙織'), '伊藤沙織');
  assert.equal(canonicalSalesName('アキラ内山'), '内山明');
  assert.equal(canonicalSalesName('AKIRA UCHIYAMA'), '内山明');
  assert.equal(isUnknownSalesName('購入者不明（2026-06-24）'), true);
  assert.equal(createSalesNameResolver([])('別の人'), '別の人');
});
test('回答補完は売上原票を変更せず、シート取得失敗を明示する', async () => {
  const charge = { id: 'charge-test', transaction_token_id: 'token-test', status: 'successful', charged_amount: 110000, metadata: {} } as UnivaPayCharge;
  const rows = parseFormIdentities([header, ['', 'answer1', '', 'person1', 'LINE名', '', '田中花子', 'a@example.com']]);
  const enriched = await enrichSalesIdentities([charge], [], async () => rows, async () => ({ email: 'a@example.com', name: '' }));
  assert.equal(enriched.charges[0].metadata?.['univapay-name'], '田中花子');
  assert.equal(enriched.charges[0].charged_amount, 110000);
  assert.equal(enriched.charges[0].id, charge.id);
  assert.equal(charge.metadata?.['univapay-name'], undefined);
  const failed = await enrichSalesIdentities([charge], [], async () => { throw new Error('403'); });
  assert.equal(failed.warnings.length, 1);
  assert.equal(failed.charges[0].metadata?.['univapay-name'], undefined);
});
