import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyReviewedIdentity, assessPaymentTag, completeCustomerLinks, matchSalesCustomer, mergeCustomerLink, parseGuardianIdentities, type GuardianIdentity, type PaymentTag } from './customerIdentity';

const now = '2026-11-07T03:00:00Z';
const input = { revenueKey: 'charge:1', email: ' A@EXAMPLE.COM ', paymentMethod: 'card' };
const form = { name: '田中花子', email: 'a@example.com', answerId: 'answer', respondentId: 'elme-1', lineName: 'はなこ', lineUserId: 'U1' };
const guardian: GuardianIdentity = { name: '田中 花子', email: 'a@example.com', elmeId: 'elme-1', lstepId: 'step-1', registeredDate: '2026/10/01', dateEvidence: 'エルメ友だち追加日', source: 'sheet-row' };
const tag: PaymentTag = { userId: 'step-1', paymentMethod: 'card', classificationStatus: 'classified', sourceComplete: true, snapshotDate: '2026-11-07' };
test('異なるID体系を別々に保存し、登録日は決済日を置換しない', () => {
  const row = matchSalesCustomer(input, [form], [guardian], [tag], now);
  assert.equal(row.elmeId, 'elme-1'); assert.equal(row.lstepId, 'step-1'); assert.equal(row.lineUserId, 'U1');
  assert.equal(row.registeredDate, '2026/10/01'); assert.equal(row.status, 'confirmed');
  assert.equal('amount' in row, false); assert.equal('paymentDate' in row, false);
  assert.equal(matchSalesCustomer({ ...input, revenueKey: 'manual:1' }, [form], [guardian], [tag], now).revenueKey, 'manual:1');
});
test('氏名だけの一致・共有メール・異なるID対応は保留', () => {
  assert.equal(matchSalesCustomer({ ...input, email: '' }, [form], [guardian], [tag], now).status, 'pending');
  assert.equal(matchSalesCustomer(input, [form, { ...form, respondentId: 'elme-2' }], [guardian], [tag], now).status, 'conflict');
  assert.equal(matchSalesCustomer(input, [form], [guardian, { ...guardian, lstepId: 'step-2' }], [tag], now).status, 'conflict');
  assert.equal(matchSalesCustomer(input, [form], [guardian, { ...guardian, email: 'other@example.com', elmeId: 'elme-2' }], [tag], now).status, 'conflict');
});
test('支払タグの競合・不足・古さ・実決済との相違を確定しない', () => {
  for (const partial of [{ classificationStatus: 'conflict' }, { sourceComplete: false }, { snapshotDate: '2026-11-01' }, { paymentMethod: 'bank' }])
    assert.ok(assessPaymentTag({ ...tag, ...partial }, 'card', now));
  assert.equal(assessPaymentTag(tag, 'card', now), '');
});
test('保存済みIDを上書きせず、空欄のみ追加する', () => {
  const row = matchSalesCustomer(input, [form], [guardian], [tag], now);
  assert.equal(mergeCustomerLink(row, { ...row, elmeId: 'wrong' }).elmeId, row.elmeId);
  assert.equal(mergeCustomerLink(row, { ...row, elmeId: 'wrong' }).status, 'conflict');
  assert.equal(mergeCustomerLink({ ...row, lstepId: '' }, row).lstepId, 'step-1');
  assert.equal(mergeCustomerLink(row, { ...row, status: 'pending', elmeId: '' }).elmeId, row.elmeId);
});
test('顧客シートの列名で読み、空欄IDは許容する', () => {
  const rows = parseGuardianIdentities([[], ['名前', 'LステップユーザーID', 'メールアドレス', 'エルメ友だちID'], ['人', '', 'A@example.com', 'elme']], 'front');
  assert.equal(rows[0].elmeId, 'elme'); assert.equal(rows[0].lstepId, ''); assert.equal(rows[0].email, 'a@example.com');
  assert.match(rows[0].source, /A3/);
});
test('契約と別名を確認した銀行振込・バック単独購入はエルメIDなしでも連携する', () => {
  const base = matchSalesCustomer({ ...input, email: '', revenueKey: 'manual:1' }, [], [], [], now);
  const review = { revenueKey: 'manual:1', lstepId: 'step-1', guardianSource: 'sheet-row', customerKey: '既存顧客キー', evidence: '契約日・契約額と既存別名を照合', expected: { amount: 100000, date: '2026-11-01', category: 'backend', name: '銀行名義' } };
  const row = applyReviewedIdentity(base, review, [{ ...guardian, elmeId: '', idEvidence: '確認済みIDメモ' }], [], [tag], 'bank', now);
  assert.equal(row.status, 'confirmed'); assert.equal(row.elmeId, ''); assert.equal(row.lstepId, 'step-1');
  assert.equal(row.customerKey, 'lstep:step-1'); assert.equal(row.saleType, 'manual'); assert.equal(row.saleId, '1');
  assert.ok(row.paymentTagReason);
  assert.throws(() => applyReviewedIdentity(base, review, [{ ...guardian, elmeId: '' }], [], [tag], 'bank', now));
  assert.equal(mergeCustomerLink(row, { ...row, lstepId: 'different' }).lstepId, 'step-1');
});
test('同じ確認済みLステップIDでフロント・バックを関連付け、明細数は維持する', () => {
  const first = matchSalesCustomer(input, [form], [guardian], [tag], now);
  const second = { ...first, revenueKey: 'manual:2', saleId: '2', saleType: 'manual' as const, elmeId: '', lineUserId: '' };
  const linked = completeCustomerLinks([first, second]);
  assert.equal(linked.length, 2); assert.equal(linked[1].elmeId, first.elmeId); assert.equal(linked[1].lineUserId, first.lineUserId);
  assert.equal(linked[1].customerKey, first.customerKey); assert.equal(second.elmeId, '');
  assert.equal(completeCustomerLinks([first, { ...second, elmeId: 'conflicting' }])[0].status, 'conflict');
});
