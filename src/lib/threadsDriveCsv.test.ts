import assert from 'node:assert/strict';
import test from 'node:test';
import { assertDriveTreeMatch, driveBatches, parseThreadsDriveCsv, snapshotFileDate } from './threadsDriveCsv';
import { SUPPLEMENTAL_METRICS } from './threadsSupplementalMetrics';

const now = new Date('2026-10-25T00:00:00Z');
const base = { snapshot_date: '2026-10-24', snapshot_at: '2026-10-24T00:00:00+09:00',
  account_username: 'kudooo_ai', post_id: '18118522570981616', parent_post_id: '', is_self_reply: 'false',
  post_url: 'https://www.threads.com/@kudooo_ai/post/DeOpK-YERN9', posted_at: '2026-10-08T18:45:44+09:00',
  caption: 'line 1, "quoted"\nline 2', ...Object.fromEntries(SUPPLEMENTAL_METRICS.map((metric) => [metric, metric === 'follows' ? '0' : ''])),
};
function csv(rows: Record<string, string>[]) {
  const fields = Object.keys(base);
  const encode = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return '\uFEFF' + fields.join(',') + '\r\n' + rows.map((row) => fields.map((field) => encode(row[field])).join(',')).join('\r\n');
}

test('Drive CSV preserves IDs, multiline captions, zero/null and JST dates', () => {
  const [row] = parseThreadsDriveCsv(csv([base]), '2026-10-24', now);
  assert.equal(row.post_id, base.post_id);
  assert.equal(row.caption, base.caption);
  assert.equal(row.follows, 0);
  assert.equal(row.views, null);
  assert.equal(row.snapshot_at, '2026-10-23T15:00:00.000Z');
  assertDriveTreeMatch(row, { root_post_id: base.post_id, node_type: 'post' });
});

test('Reject wrong dates, ownership, bad booleans, negative and scientific metrics', () => {
  const overrides: Record<string, string>[] = [{ snapshot_date: '2026-10-23' }, { account_username: 'someone_else' },
    { is_self_reply: '1' }, { follows: '-1' }, { follows: '2e3' }, { post_id: '1.81E16' },
    { parent_post_id: '123' }, { posted_at: '2026-10-25T00:00:00Z' }];
  for (const override of overrides) {
    assert.throws(() => parseThreadsDriveCsv(csv([{ ...base, ...override }]), undefined, now));
  }
  assert.throws(() => parseThreadsDriveCsv(csv([base]), '2026-10-23', now));
});

test('Reject mismatched reply tree and duplicate keys across batch boundaries', () => {
  const [reply] = parseThreadsDriveCsv(csv([{ ...base, post_id: '123', is_self_reply: 'true', parent_post_id: base.post_id }]), undefined, now);
  assertDriveTreeMatch(reply, { root_post_id: base.post_id, node_type: 'reply' });
  assert.throws(() => assertDriveTreeMatch(reply, { root_post_id: '999', node_type: 'reply' }));
  assert.throws(() => assertDriveTreeMatch(reply, { root_post_id: base.post_id, node_type: 'post' }));
  const many = Array.from({ length: 101 }, (_, index) => ({ ...base, post_id: String(1000 + index), post_url: `https://www.threads.com/@kudooo_ai/post/code${index}` }));
  const rows = parseThreadsDriveCsv(csv(many), undefined, now);
  assert.deepEqual(driveBatches(rows).map((batch) => batch.snapshots.length), [100, 1]);
  assert.throws(() => parseThreadsDriveCsv(csv([...many, many[0]]), undefined, now));
});

test('Automatic selection excludes samples, old top30, and unfinished files', () => {
  assert.equal(snapshotFileDate('threads_post_insights_2026-10-24.csv'), '2026-10-24');
  for (const name of ['sample_tree_snapshot_2026-10-24.csv', 'threads_top30_follows_2026-09-25_2026-10-24.csv', 'threads_post_insights_2026-10-24.csv.tmp']) {
    assert.equal(snapshotFileDate(name), null);
  }
});

test('Blank classification remains unknown and can match a registered reply without becoming a root', () => {
  const [row] = parseThreadsDriveCsv(csv([{ ...base, is_self_reply: '' }]), undefined, now);
  assert.equal(row.is_self_reply, null);
  assert.equal(row.parent_post_id, null);
  assertDriveTreeMatch(row, { root_post_id: '999', node_type: 'reply' });
  assertDriveTreeMatch(row, { root_post_id: base.post_id, node_type: 'post' });
  assert.throws(() => assertDriveTreeMatch(row, { root_post_id: '', node_type: 'unknown' }));
  assert.throws(() => parseThreadsDriveCsv(csv([{ ...base, is_self_reply: '', parent_post_id: '999' }]), undefined, now));
});
