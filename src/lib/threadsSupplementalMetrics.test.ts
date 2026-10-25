import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compareNullableDescending, followConversionRate, normalizeThreadsPostUrl, matchSupplementalPost, summarizeTreeFollows,
  validateSupplementalBatch, summarizeTreeInsights, treeInsightSortValue,
} from './threadsSupplementalMetrics';

const sample = { snapshot_at: '2026-10-24T00:00:00+09:00', post_url: 'https://www.threads.com/@kudooo_ai/post/DeOpK-YERN9', follows: 0 };
const body = (rows: unknown[] = [sample]) => ({ source: 'muse_threads', account_username: 'kudooo_ai', snapshots: rows });
const now = new Date('2026-10-24T12:00:00Z');

test('retains a measured zero, missing metrics and JST date separately', () => {
  const row = validateSupplementalBatch(body(), now).snapshots[0];
  assert.equal(row.follows, 0);
  assert.equal(row.profile_visits, null);
  assert.equal(row.snapshot_date, '2026-10-24');
  assert.equal(row.snapshot_at, '2026-10-23T15:00:00.000Z');
});

test('tree conversions use summed counts, deduplicate IDs and never divide incomplete cohorts', () => {
  const node = (id: string, follows: number | null, profileVisits: number | null) => ({
    id, insights: { follows, profileVisits, views: null, snapshotAt: sample.snapshot_at },
  });
  const rows = [node('1', 27, 1660), node('2', 2, 153), node('3', 9, 828), node('4', 0, 60)];
  assert.deepEqual(summarizeTreeInsights([...rows, rows[3]]), {
    follows: 38, profileVisits: 2701, followsComplete: true, profileVisitsComplete: true, conversionComparable: true, conversionRate: 38 / 2701 * 100,
  });
  assert.deepEqual(summarizeTreeInsights([node('1', 27, null), node('2', null, 153)]), {
    follows: 27, profileVisits: 153, followsComplete: false, profileVisitsComplete: false, conversionComparable: false, conversionRate: null,
  });
  assert.equal(summarizeTreeInsights([node('1', 0, 100)]).conversionRate, 0);
  const partial = summarizeTreeInsights([node('1', 5, 200), { id: '2' }]);
  assert.equal(partial.conversionRate, 2.5);
  assert.equal(partial.followsComplete, false);
  assert.equal(summarizeTreeInsights([node('1', 0, 0)]).conversionRate, null);
  assert.equal(summarizeTreeInsights([{ id: '1' }]).follows, null);
  assert.equal(summarizeTreeInsights([]).followsComplete, false);
});

test('ranking follows displayed values for complete and partial trees, with unknowns last', () => {
  const tree = (id: string, follows: number | null, profileVisits: number | null, partial = false) => ({
    id, summary: summarizeTreeInsights([
      { id, insights: { follows, profileVisits, views: null, snapshotAt: sample.snapshot_at } },
      ...(partial ? [{ id: `${id}-missing` }] : []),
    ]),
  });
  const rows = [tree('complete', 38, 2701), tree('partial', 50, 3000, true), tree('zero', 0, 100), tree('unknown', null, null), tree('mismatched', 1, null)];
  for (const metric of ['follows', 'profileVisits', 'followConversion', 'treeFollows'] as const) {
    const sorted = [...rows].sort((a, b) => compareNullableDescending(treeInsightSortValue(a.summary, metric), treeInsightSortValue(b.summary, metric)));
    assert.equal(sorted[0].id, 'partial');
    assert.equal(sorted[1].id, 'complete');
  }
  const rates = rows.map((row) => treeInsightSortValue(row.summary, 'followConversion')).sort(compareNullableDescending);
  assert.deepEqual(rates, [50 / 3000 * 100, 38 / 2701 * 100, 0, null, null]);
});

test('normalizes legacy domains, query strings and trailing slashes', () => {
  assert.equal(normalizeThreadsPostUrl('https://threads.net/@kudooo_ai/post/DeOpK-YERN9/?x=1'), sample.post_url);
});

test('rejects other accounts, deceptive hosts and invalid post IDs', () => {
  for (const post_url of ['https://www.threads.com/@someone/post/abc', 'https://threads.com.evil.test/@kudooo_ai/post/abc', 'https://threads.com:444/@kudooo_ai/post/abc']) {
    assert.throws(() => validateSupplementalBatch(body([{ ...sample, post_url }]), now));
  }
  assert.throws(() => validateSupplementalBatch({ ...body(), account_username: 'someone' }, now));
  assert.throws(() => validateSupplementalBatch(body([{ ...sample, post_id: 123 }]), now));
  assert.throws(() => validateSupplementalBatch(body([{ ...sample, post_id: 'DeOpK-YERN9' }]), now));
});

test('rejects inferred, negative, fractional or unsafe counts', () => {
  for (const follows of [-1, 1.5, '27', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateSupplementalBatch(body([{ ...sample, follows }]), now));
  }
  assert.throws(() => validateSupplementalBatch(body([{ ...sample, follows: null }]), now));
});

test('requires an explicit real observation timestamp, not a date or future time', () => {
  for (const snapshot_at of ['2026-10-24', '2026-10-24T10:00:00', '2026-02-30T10:00:00Z', '2026-10-25T10:00:00Z']) {
    assert.throws(() => validateSupplementalBatch(body([{ ...sample, snapshot_at }]), now));
  }
});

test('rejects duplicate daily observations and oversized batches', () => {
  assert.throws(() => validateSupplementalBatch(body([sample, { ...sample, snapshot_at: '2026-10-24T01:00:00+09:00' }]), now));
  assert.throws(() => validateSupplementalBatch(body(Array(101).fill(sample)), now));
  assert.throws(() => validateSupplementalBatch(body([]), now));
});

test('zero follows is a valid conversion but missing or zero denominator is not', () => {
  const insight = { follows: 0, profileVisits: 100, views: 1000, snapshotAt: sample.snapshot_at };
  assert.equal(followConversionRate(insight), 0);
  assert.equal(followConversionRate({ ...insight, follows: 27, profileVisits: 1660 }), 27 / 1660 * 100);
  assert.equal(followConversionRate({ ...insight, profileVisits: 0 }), null);
  assert.equal(followConversionRate({ ...insight, follows: null }), null);
  assert.deepEqual([null, 0, 27, undefined, 5].sort(compareNullableDescending), [27, 5, 0, null, undefined]);
});

test('resolves a reply to its registered root and rejects conflicting IDs or roots', () => {
  const snapshot = validateSupplementalBatch(body(), now).snapshots[0];
  const candidate = { post_id: '123', permalink: sample.post_url, root_post_id: '456', node_type: 'reply' as const };
  const matched = matchSupplementalPost(snapshot, [candidate, candidate]);
  assert.equal(matched.node_type, 'reply');
  assert.equal(matched.root_post_id, '456');
  assert.throws(() => matchSupplementalPost({ ...snapshot, post_id: '999' }, [candidate]));
  assert.throws(() => matchSupplementalPost(snapshot, [candidate, { ...candidate, root_post_id: '789' }]));
  assert.throws(() => matchSupplementalPost(snapshot, [{ ...candidate, permalink: sample.post_url.replace('kudooo_ai', 'someone') }]));
});

test('tree totals distinguish complete, partial, zero and unknown observations without double counting', () => {
  const node = (id: string, follows: number | null) => ({ id, insights: { follows, profileVisits: null, views: null, snapshotAt: sample.snapshot_at } });
  assert.deepEqual(summarizeTreeFollows([node('1', 27), node('2', 2), node('3', 9), node('4', 0), node('4', 0)]), {
    follows: 38, measuredNodes: 4, knownNodes: 4, complete: true,
  });
  assert.deepEqual(summarizeTreeFollows([node('1', 27), node('2', null)]), {
    follows: 27, measuredNodes: 1, knownNodes: 2, complete: false,
  });
  assert.equal(summarizeTreeFollows([node('1', 0)]).follows, 0);
  assert.equal(summarizeTreeFollows([node('1', null)]).follows, null);
});
