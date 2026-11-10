import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildCustomerRoster, type Purchase } from './model';
import {
  EMPTY_FOLLOWUP,
  legacyClosing,
  closingRecord,
  needsOfferReview,
  validateFollowup,
} from './followup';
import { readFollowups, saveFollowup } from './followup-store';
const customer = (closingStatus?: string) =>
  buildCustomerRoster([
    {
      id: 'front',
      serviceId: 'frontend',
      name: '確認用',
      realName: '確認用',
      date: '2026-01-01',
      dateBasis: 'test',
      aliases: ['elme:1'],
      amount: 100000,
      amountKind: 'payment',
      acquisition: true,
      source: 'test',
      roster: true,
      closingStatus,
    } as Purchase,
  ])[0];
test('missing and FALSE closing records never assert an unoffered consultation', () => {
  assert.equal(legacyClosing(customer()).code, 'unknown');
  assert.equal(legacyClosing(customer('false')).code, 'pending');
  assert.equal(EMPTY_FOLLOWUP.offer, 'unknown');
  assert.equal(needsOfferReview(customer()), true);
  assert.equal(needsOfferReview(customer('false')), true);
});
test('past no-prospect and completed meetings stay distinct from proposal tracking', () => {
  assert.equal(legacyClosing(customer('見込み無し')).code, 'none');
  assert.equal(needsOfferReview(customer('見込み無し')), false);
  assert.equal(legacyClosing(customer('済（×）')).code, 'lost');
  assert.equal(needsOfferReview(customer('済（×）')), false);
  assert.equal(
    needsOfferReview(customer('false'), {
      ...EMPTY_FOLLOWUP,
      offer: 'offered',
    }),
    false,
  );
  const back = customer('false');
  back.purchases.push({
    ...back.purchases[0],
    id: 'back',
    serviceId: 'backend',
  });
  assert.equal(needsOfferReview(back), false);
});
test('manual offer records reject invalid statuses, impossible dates, and dates inconsistent with offer state', () => {
  assert.throws(() =>
    validateFollowup({ ...EMPTY_FOLLOWUP, offer: 'bad' }, '2026-11-10'),
  );
  assert.throws(() =>
    validateFollowup({ ...EMPTY_FOLLOWUP, closing: 'bad' }, '2026-11-10'),
  );
  for (const offeredDate of ['2026-02-30', '2026-11-11'])
    assert.throws(() =>
      validateFollowup(
        { ...EMPTY_FOLLOWUP, offer: 'offered', offeredDate },
        '2026-11-10',
      ),
    );
  assert.throws(() =>
    validateFollowup(
      { ...EMPTY_FOLLOWUP, offer: 'not_offered', offeredDate: '2026-11-01' },
      '2026-11-10',
    ),
  );
  assert.equal(
    validateFollowup(
      {
        ...EMPTY_FOLLOWUP,
        offer: 'offered',
        offeredDate: '2026-11-01',
        memo: '  確認済み  ',
      },
      '2026-11-10',
    ).memo,
    '確認済み',
  );
});
test('followups persist per customer without modifying member sheets, including long Japanese identity keys', async () => {
  const original = process.cwd(),
    directory = await mkdtemp(path.join(tmpdir(), 'customer-followup-test-'));
  process.chdir(directory);
  try {
    const id = 'member-pair:' + '確認'.repeat(100);
    await saveFollowup(id, { ...EMPTY_FOLLOWUP, offer: 'not_offered' });
    await saveFollowup('elme:2', {
      ...EMPTY_FOLLOWUP,
      offer: 'offered',
      offeredDate: '2026-01-01',
    });
    let saved = await readFollowups();
    assert.equal(saved[id].offer, 'not_offered');
    assert.equal(saved['elme:2'].offeredDate, '2026-01-01');
    await saveFollowup(id, {
      ...EMPTY_FOLLOWUP,
      offer: 'declined',
      closing: 'lost',
    });
    saved = await readFollowups();
    assert.equal(saved[id].offer, 'declined');
    assert.equal(saved[id].closing, 'lost');
    assert.equal(saved['elme:2'].offer, 'offered');
  } finally {
    process.chdir(original);
    await rm(directory, { recursive: true, force: true });
  }
});

test('manual closing overrides the imported result and updates proposal review without changing purchase evidence', () => {
  const c = customer('false');
  const saved = { ...EMPTY_FOLLOWUP, closing: 'won' as const };
  assert.equal(closingRecord(c).label, '未実施');
  assert.equal(closingRecord(c, saved).label, '成約');
  assert.equal(needsOfferReview(c, saved), false);
  assert.equal(c.purchases.length, 1);
  assert.equal(c.purchases[0].serviceId, 'frontend');
  assert.equal(
    closingRecord(c, { ...saved, closing: 'inherit' }).label,
    '未実施',
  );
  assert.equal(
    closingRecord(c, { ...saved, closing: 'unknown' }).label,
    '未記録',
  );
});
