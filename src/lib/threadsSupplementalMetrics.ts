export const SUPPLEMENTAL_METRICS = [
  'views', 'reach', 'likes', 'replies', 'reposts', 'quotes', 'shares',
  'profile_visits', 'follows', 'views_from_followers', 'views_from_non_followers',
] as const;

export type MetricName = typeof SUPPLEMENTAL_METRICS[number];

export type SupplementalSnapshot = Record<MetricName, number | null> & {
  snapshot_at: string;
  snapshot_date: string;
  post_url: string;
  post_id: string | null;
};

export interface SupplementalBatch {
  source: 'muse_threads';
  account_username: 'kudooo_ai';
  snapshots: SupplementalSnapshot[];
}

export interface SupplementalPostInsights {
  snapshotAt: string;
  follows: number | null;
  profileVisits: number | null;
  views: number | null;
  metrics?: Record<MetricName, number | null>;
}

export interface KnownSupplementalPost {
  post_id: string;
  permalink: string;
  root_post_id: string;
  node_type: 'post' | 'reply';
}

export function matchSupplementalPost(snapshot: SupplementalSnapshot, candidates: KnownSupplementalPost[]) {
  const matches = candidates.filter((candidate) => {
    try { return normalizeThreadsPostUrl(candidate.permalink) === snapshot.post_url; } catch { return false; }
  });
  const identities = new Map(matches.map((row) => [`${row.post_id}:${row.root_post_id}:${row.node_type}`, row]));
  if (identities.size !== 1) throw new SupplementalValidationError(`Post match missing or ambiguous: ${snapshot.post_url}`);
  const match = [...identities.values()][0];
  if (!/^\d+$/.test(match.post_id) || !/^\d+$/.test(match.root_post_id) ||
      (snapshot.post_id !== null && snapshot.post_id !== match.post_id)) {
    throw new SupplementalValidationError(`Post ID mismatch: ${snapshot.post_url}`);
  }
  return { ...snapshot, post_id: match.post_id, root_post_id: match.root_post_id, node_type: match.node_type };
}

export function summarizeTreeFollows(nodes: Array<{ id: string; insights?: SupplementalPostInsights | null }>) {
  const unique = [...new Map(nodes.map((node) => [node.id, node])).values()];
  const measured = unique.filter((node) => node.insights?.follows != null);
  return {
    follows: measured.length ? measured.reduce((sum, node) => sum + node.insights!.follows!, 0) : null,
    measuredNodes: measured.length,
    knownNodes: unique.length,
    complete: unique.length > 0 && measured.length === unique.length,
  };
}

export type SupplementalStatus = 'ready' | 'not_configured' | 'unavailable';

export class SupplementalValidationError extends Error {}

export function normalizeThreadsPostUrl(value: unknown): string {
  if (typeof value !== 'string') throw new SupplementalValidationError('post_url is required');
  let url: URL;
  try { url = new URL(value); } catch { throw new SupplementalValidationError('Invalid post_url'); }
  const match = url.pathname.match(/^\/@kudooo_ai\/post\/([A-Za-z0-9_-]+)\/?$/);
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
      !['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net'].includes(url.hostname) || !match) {
    throw new SupplementalValidationError('post_url must belong to @kudooo_ai on Threads');
  }
  return `https://www.threads.com/@kudooo_ai/post/${match[1]}`;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SupplementalValidationError('Expected a JSON object');
  }
  return value as Record<string, unknown>;
}

export function validateSupplementalBatch(input: unknown, now = new Date()): SupplementalBatch {
  const body = object(input);
  if (body.source !== 'muse_threads' || body.account_username !== 'kudooo_ai') {
    throw new SupplementalValidationError('Only muse_threads / kudooo_ai is supported');
  }
  if (!Array.isArray(body.snapshots) || body.snapshots.length < 1 || body.snapshots.length > 100) {
    throw new SupplementalValidationError('snapshots must contain 1 to 100 rows');
  }
  const keys = new Set<string>();
  const snapshots = body.snapshots.map((inputRow) => {
    const row = object(inputRow);
    if (typeof row.snapshot_at !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(row.snapshot_at)) {
      throw new SupplementalValidationError('snapshot_at must be an ISO timestamp with a timezone');
    }
    const at = new Date(row.snapshot_at);
    const calendarDate = row.snapshot_at.slice(0, 10);
    const calendar = new Date(`${calendarDate}T00:00:00Z`);
    if (!Number.isFinite(at.getTime()) || !Number.isFinite(calendar.getTime()) ||
        calendar.toISOString().slice(0, 10) !== calendarDate || at.getTime() > now.getTime() + 300_000) {
      throw new SupplementalValidationError('snapshot_at is invalid or in the future');
    }
    const snapshot_date = new Date(at.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const post_url = normalizeThreadsPostUrl(row.post_url);
    const key = `${snapshot_date}:${post_url}`;
    if (keys.has(key)) throw new SupplementalValidationError('Duplicate post/date in batch');
    keys.add(key);
    if (row.post_id != null && (typeof row.post_id !== 'string' || !/^\d+$/.test(row.post_id))) {
      throw new SupplementalValidationError('post_id must be a numeric string, not a shortcode');
    }
    const metrics = Object.fromEntries(SUPPLEMENTAL_METRICS.map((name) => {
      const value = row[name] ?? null;
      if (value !== null && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)) {
        throw new SupplementalValidationError(`${name} must be a nonnegative integer or null`);
      }
      return [name, value];
    })) as Record<MetricName, number | null>;
    if (metrics.follows === null && metrics.profile_visits === null) {
      throw new SupplementalValidationError('At least follows or profile_visits must be present');
    }
    return { ...metrics, snapshot_at: at.toISOString(), snapshot_date, post_url, post_id: row.post_id as string | null ?? null };
  });
  return { source: 'muse_threads', account_username: 'kudooo_ai', snapshots };
}

export function followConversionRate(insights?: SupplementalPostInsights | null): number | null {
  if (insights?.follows == null || insights.profileVisits == null || insights.profileVisits <= 0) return null;
  return insights.follows / insights.profileVisits * 100;
}

export function compareNullableDescending(a: number | null | undefined, b: number | null | undefined): number {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  return b - a;
}
