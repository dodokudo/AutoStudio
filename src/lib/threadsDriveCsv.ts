import { parse } from 'csv-parse/sync';
import { normalizeThreadsPostUrl, SUPPLEMENTAL_METRICS, validateSupplementalBatch, type KnownSupplementalPost, type SupplementalBatch, type SupplementalSnapshot } from './threadsSupplementalMetrics';

export const THREADS_INSIGHTS_FOLDER = '1hRfvcpd3kMkAdSmNFyPD-dpX1Sf_QCHS';
export const MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024;
export type DriveSnapshot = SupplementalSnapshot & {
  parent_post_id: string | null;
  is_self_reply: boolean | null;
  posted_at: string | null;
  caption: string;
  drive_file_id?: string;
  drive_file_name?: string;
  drive_file_version?: string;
};

export function snapshotFileDate(name: string): string | null {
  return /^threads_post_insights_(\d{4}-\d{2}-\d{2})\.csv$/.exec(name)?.[1] ?? null;
}

export function parseThreadsDriveCsv(text: string, expectedDate?: string, now = new Date()): DriveSnapshot[] {
  if (Buffer.byteLength(text) > MAX_SNAPSHOT_BYTES) throw new Error('CSV exceeds 20 MiB');
  const required = ['snapshot_date', 'snapshot_at', 'account_username', 'post_id', 'parent_post_id', 'is_self_reply', 'post_url', 'posted_at', 'caption', ...SUPPLEMENTAL_METRICS];
  const rows = parse(text, {
    bom: true, skip_empty_lines: true, max_record_size: 1024 * 1024,
    columns: (headers: string[]) => {
      if (new Set(headers).size !== headers.length || required.some((field) => !headers.includes(field))) {
        throw new Error('CSV headers missing or duplicated');
      }
      return headers;
    },
  }) as Record<string, string>[];
  if (!rows.length || rows.length > 100_000) throw new Error('CSV must contain 1 to 100000 rows');
  const keys = new Set<string>();
  let fileDate = expectedDate;
  return rows.map((row, index) => {
    try {
      if (!['true', 'false', ''].includes(row.is_self_reply)) throw new Error('is_self_reply must be true, false or blank (unknown)');
      const parent = row.parent_post_id.trim() || null;
      const isReply = row.is_self_reply === '' ? null : row.is_self_reply === 'true';
      if (!/^\d+$/.test(row.post_id) || (isReply ? !parent || !/^\d+$/.test(parent) || parent === row.post_id : parent !== null)) {
        throw new Error('Invalid post_id / root parent_post_id');
      }
      const metrics = Object.fromEntries(SUPPLEMENTAL_METRICS.map((name) => {
        const value = row[name].trim();
        if (value !== '' && value !== 'null' && !/^\d+$/.test(value)) throw new Error(`Invalid ${name}`);
        return [name, value === '' || value === 'null' ? null : Number(value)];
      }));
      const [snapshot] = validateSupplementalBatch({ source: 'muse_threads', account_username: row.account_username,
        snapshots: [{ ...metrics, post_id: row.post_id, post_url: row.post_url, snapshot_at: row.snapshot_at }],
      }, now).snapshots;
      fileDate ??= snapshot.snapshot_date;
      if (row.snapshot_date !== snapshot.snapshot_date || row.snapshot_date !== fileDate) throw new Error('snapshot_date must match JST observation date and filename');
      const key = `${snapshot.snapshot_date}:${snapshot.post_id}`;
      if (keys.has(key)) throw new Error('Duplicate post/date in file');
      keys.add(key);
      let postedAt: string | null = null;
      if (row.posted_at.trim()) {
        postedAt = validateSupplementalBatch({ source: 'muse_threads', account_username: row.account_username,
          snapshots: [{ ...snapshot, snapshot_at: row.posted_at }],
        }, now).snapshots[0].snapshot_at;
        if (postedAt > snapshot.snapshot_at) throw new Error('posted_at is later than snapshot_at');
      }
      return { ...snapshot, parent_post_id: parent, is_self_reply: isReply, posted_at: postedAt, caption: row.caption };
    } catch (error) {
      throw new Error(`CSV record ${index + 1}: ${(error as Error).message}`);
    }
  });
}

export function driveBatches(rows: DriveSnapshot[]): SupplementalBatch[] {
  const batches: SupplementalBatch[] = [];
  for (let index = 0; index < rows.length; index += 100) {
    batches.push({ source: 'muse_threads', account_username: 'kudooo_ai', snapshots: rows.slice(index, index + 100) });
  }
  return batches;
}

export function assertDriveTreeMatch(expected: DriveSnapshot, actual: { root_post_id: string; node_type: string }) {
  if (!/^\d+$/.test(actual.root_post_id) || !['post', 'reply'].includes(actual.node_type)) {
    throw new Error(`Registered tree is invalid: ${expected.post_id}`);
  }
  // Unknown CSV classification can only be resolved from an unambiguous registered tree.
  // It must never fall through to the false (root post) case.
  if (expected.is_self_reply === null) return;
  if (actual.node_type !== (expected.is_self_reply ? 'reply' : 'post') ||
      actual.root_post_id !== (expected.parent_post_id ?? expected.post_id)) {
    throw new Error(`CSV tree differs from registered owner tree: ${expected.post_id}`);
  }
}

export type DriveCatalogEntry = KnownSupplementalPost & { account_key: string };

// Only recover explicitly classified own replies whose root already belongs to this account.
export function planDriveReplyRegistrations(rows: DriveSnapshot[], catalog: DriveCatalogEntry[]) {
  const normalize = (url: string) => { try { return normalizeThreadsPostUrl(url); } catch { return null; } };
  return rows.filter((row) => {
    if (row.is_self_reply !== true || !row.post_id || !row.parent_post_id) return false;
    if (catalog.some((entry) => entry.post_id === row.post_id || normalize(entry.permalink) === row.post_url)) return false;
    if (rows.some((other) => other.post_id !== row.post_id && other.post_url === row.post_url)) return false;
    const parents = catalog.filter((entry) => entry.post_id === row.parent_post_id);
    return parents.length > 0 && parents.every((entry) => entry.account_key === 'main' &&
      entry.node_type === 'post' && entry.root_post_id === row.parent_post_id && normalize(entry.permalink) !== null) &&
      new Set(parents.map((entry) => normalize(entry.permalink))).size === 1;
  });
}
