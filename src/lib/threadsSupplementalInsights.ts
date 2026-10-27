import { createHash } from 'node:crypto';
import { createBigQueryClient, resolveProjectId } from './bigquery';
import {
  matchSupplementalPost, SUPPLEMENTAL_METRICS,
  type KnownSupplementalPost, type SupplementalBatch, type SupplementalPostInsights, type SupplementalStatus,
} from './threadsSupplementalMetrics';

const DATASET = 'autostudio_threads';
export const SUPPLEMENTAL_TABLE = 'threads_post_insights_snapshot';
const projectId = resolveProjectId();
const table = `\`${projectId}.${DATASET}.${SUPPLEMENTAL_TABLE}\``;

export function supplementalInsightsEnabled(): boolean {
  return process.env.THREADS_SUPPLEMENTAL_INSIGHTS_ENABLED?.trim() === 'true';
}

function plain(value: unknown): string {
  return String(value && typeof value === 'object' && 'value' in value ? value.value : value ?? '');
}

export async function findSupplementalPostCandidates(batch: SupplementalBatch) {
  const client = createBigQueryClient(projectId);
  const [driveRepliesExist] = await client.dataset(DATASET).table('threads_drive_replies').exists();
  const [rows] = await client.query({
    query: `SELECT P.post_id, P.permalink, P.post_id AS root_post_id, 'post' AS node_type
      FROM \`${projectId}.${DATASET}.threads_posts\` P
      WHERE COALESCE(P.account_key, 'main') = 'main'
        AND REGEXP_EXTRACT(P.permalink, r'/post/([A-Za-z0-9_-]+)') IN UNNEST(@codes)
        AND NOT EXISTS (SELECT 1 FROM \`${projectId}.${DATASET}.threads_comments\` C
          WHERE C.comment_id = P.post_id AND COALESCE(C.account_key, 'main') = 'main')
      UNION ALL
      SELECT C.comment_id AS post_id, C.permalink, C.parent_post_id AS root_post_id, 'reply' AS node_type
      FROM \`${projectId}.${DATASET}.threads_comments\` C
      JOIN \`${projectId}.${DATASET}.threads_posts\` P ON P.post_id = C.parent_post_id
        AND COALESCE(P.account_key, 'main') = 'main'
      WHERE COALESCE(C.account_key, 'main') = 'main'
        AND REGEXP_EXTRACT(C.permalink, r'/post/([A-Za-z0-9_-]+)') IN UNNEST(@codes)
        AND REGEXP_CONTAINS(P.permalink, r'^https://(www\\.)?threads\\.(com|net)/@kudooo_ai/post/')
      ${driveRepliesExist ? `UNION ALL
      SELECT D.post_id, D.post_url AS permalink, D.root_post_id, 'reply' AS node_type
      FROM \`${projectId}.${DATASET}.threads_drive_replies\` D
      JOIN \`${projectId}.${DATASET}.threads_posts\` P ON P.post_id = D.root_post_id
        AND COALESCE(P.account_key, 'main') = 'main'
      WHERE REGEXP_EXTRACT(D.post_url, r'/post/([A-Za-z0-9_-]+)') IN UNNEST(@codes)
        AND REGEXP_CONTAINS(P.permalink, r'^https://(www\\.)?threads\\.(com|net)/@kudooo_ai/post/')` : ''}`,
    params: { codes: batch.snapshots.map((row) => row.post_url.split('/post/')[1]) },
    maximumBytesBilled: '1000000000',
  });
  return rows as KnownSupplementalPost[];
}

export async function resolveSupplementalPosts(batch: SupplementalBatch) {
  const rows = await findSupplementalPostCandidates(batch);
  return batch.snapshots.map((snapshot) => matchSupplementalPost(snapshot, rows));
}

// Both ingestion and the temporary-table integration check use this SQL.
export function supplementalMergeSql(target = table): string {
  const fields = ['snapshot_date', 'snapshot_at', 'source', 'account_key', 'account_username', 'post_id', 'post_url', 'root_post_id', 'node_type', ...SUPPLEMENTAL_METRICS, 'payload_json'];
  return `
    CREATE OR REPLACE TEMP TABLE incoming AS
    SELECT DATE(JSON_VALUE(row, '$.snapshot_date')) AS snapshot_date,
      TIMESTAMP(JSON_VALUE(row, '$.snapshot_at')) AS snapshot_at,
      'muse_threads' AS source, 'main' AS account_key, 'kudooo_ai' AS account_username,
      JSON_VALUE(row, '$.post_id') AS post_id, JSON_VALUE(row, '$.post_url') AS post_url,
      JSON_VALUE(row, '$.root_post_id') AS root_post_id, JSON_VALUE(row, '$.node_type') AS node_type,
      ${SUPPLEMENTAL_METRICS.map((name) => `CAST(JSON_VALUE(row, '$.${name}') AS INT64) AS ${name}`).join(',\n      ')},
      TO_JSON_STRING(row) AS payload_json
    FROM UNNEST(JSON_QUERY_ARRAY(PARSE_JSON(@snapshots))) AS row;

    ASSERT NOT EXISTS (
      SELECT 1 FROM ${target} T JOIN incoming S
        ON T.source = S.source AND T.account_key = S.account_key AND T.post_id = S.post_id
        AND T.snapshot_date = S.snapshot_date AND T.snapshot_at = S.snapshot_at
      WHERE ${SUPPLEMENTAL_METRICS.map((name) => `T.${name} IS DISTINCT FROM S.${name}`).join(' OR ')}
    ) AS 'Conflicting values for the same observation timestamp';

    MERGE ${target} T USING incoming S
      ON T.source = S.source AND T.account_key = S.account_key AND T.post_id = S.post_id
        AND T.snapshot_date = S.snapshot_date
    WHEN MATCHED AND S.snapshot_at > T.snapshot_at THEN UPDATE SET
      ${fields.filter((name) => !['snapshot_date', 'source', 'account_key', 'post_id'].includes(name)).map((name) => `${name} = S.${name}`).join(', ')},
      received_at = CURRENT_TIMESTAMP()
    WHEN MATCHED AND S.snapshot_at = T.snapshot_at AND S.payload_json IS DISTINCT FROM T.payload_json THEN UPDATE SET
      payload_json = S.payload_json, root_post_id = S.root_post_id, node_type = S.node_type, received_at = CURRENT_TIMESTAMP()
    WHEN NOT MATCHED THEN INSERT (${fields.join(', ')}, received_at)
      VALUES (${fields.map((name) => `S.${name}`).join(', ')}, CURRENT_TIMESTAMP());

    SELECT T.post_id, CAST(T.snapshot_date AS STRING) AS snapshot_date,
      T.snapshot_at, T.follows, T.profile_visits
    FROM ${target} T JOIN incoming S
      ON T.source = S.source AND T.account_key = S.account_key AND T.post_id = S.post_id
      AND T.snapshot_date = S.snapshot_date;
  `;
}

export async function saveSupplementalInsights(batch: SupplementalBatch) {
  const snapshots = await resolveSupplementalPosts(batch);
  snapshots.sort((a, b) => `${a.snapshot_date}:${a.post_id}`.localeCompare(`${b.snapshot_date}:${b.post_id}`));
  const serialized = JSON.stringify(snapshots);
  const client = createBigQueryClient(projectId);
  const [metadata] = await client.dataset(DATASET).getMetadata();
  const location = String(metadata.location);
  // Stable job IDs make an exact retry (including concurrent retries) reuse the same write.
  const jobId = `threads_insights_${createHash('sha256').update(`${table}:${supplementalMergeSql()}:${serialized}`).digest('hex')}`;
  let job;
  try {
    [job] = await client.createQueryJob({
      jobId, location, query: supplementalMergeSql(), params: { snapshots: serialized },
      maximumBytesBilled: '1000000000',
    });
  } catch (error) {
    if ((error as { code?: number }).code !== 409) throw error;
    job = client.job(jobId, { location });
    const [previous] = await job.getMetadata();
    if (previous.status?.errorResult) {
      // A failed job ID cannot be rerun. The MERGE itself remains idempotent.
      [job] = await client.createQueryJob({
        location, query: supplementalMergeSql(), params: { snapshots: serialized },
        maximumBytesBilled: '1000000000',
      });
    }
  }
  await job.getQueryResults();
  // Read current persisted rows even when the write job was an earlier successful retry.
  const [saved] = await client.query({
    query: `SELECT post_id, CAST(snapshot_date AS STRING) AS snapshot_date, snapshot_at, follows, profile_visits
      FROM ${table} WHERE source = 'muse_threads' AND account_key = 'main'
        AND CONCAT(CAST(snapshot_date AS STRING), ':', post_id) IN UNNEST(@keys)`,
    params: { keys: snapshots.map((row) => `${row.snapshot_date}:${row.post_id}`) },
    location, maximumBytesBilled: '1000000000',
  });
  if (saved.length !== snapshots.length || snapshots.some((row) => !saved.some((value: Record<string, unknown>) =>
    plain(value.post_id) === row.post_id && plain(value.snapshot_date) === row.snapshot_date &&
    new Date(plain(value.snapshot_at)).getTime() >= new Date(row.snapshot_at).getTime()))) {
    throw new Error('Snapshot persistence verification failed');
  }
  return { accepted: snapshots.length, snapshots: saved };
}

export async function getSupplementalInsights(posts: Array<{ postedThreadId: string; accountKey: string; commentData?: Array<{ commentId: string }> }>): Promise<{
  status: SupplementalStatus;
  byPostId: Map<string, SupplementalPostInsights>;
}> {
  const byPostId = new Map<string, SupplementalPostInsights>();
  if (!supplementalInsightsEnabled()) return { status: 'not_configured', byPostId };
  const ids = [...new Set(posts.filter((post) => post.accountKey === 'main')
    .flatMap((post) => [post.postedThreadId, ...(post.commentData ?? []).map((comment) => comment.commentId)]))];
  if (!ids.length) return { status: 'ready', byPostId };
  try {
    const client = createBigQueryClient(projectId);
    const [rows] = await client.query({
      query: `SELECT post_id, snapshot_at, ${SUPPLEMENTAL_METRICS.join(', ')} FROM ${table}
        WHERE source = 'muse_threads' AND account_key = 'main' AND post_id IN UNNEST(@ids)
        QUALIFY ROW_NUMBER() OVER (PARTITION BY account_key, post_id ORDER BY snapshot_at DESC, received_at DESC) = 1`,
      params: { ids }, maximumBytesBilled: '1000000000',
    });
    for (const row of rows) {
      byPostId.set(plain(row.post_id), {
        snapshotAt: new Date(plain(row.snapshot_at)).toISOString(),
        follows: row.follows == null ? null : Number(row.follows),
        profileVisits: row.profile_visits == null ? null : Number(row.profile_visits),
        views: row.views == null ? null : Number(row.views),
        metrics: Object.fromEntries(SUPPLEMENTAL_METRICS.map((name) => [name, row[name] == null ? null : Number(row[name])])) as SupplementalPostInsights['metrics'],
      });
    }
    return { status: 'ready', byPostId };
  } catch (error) {
    console.error('[threads/supplemental] Read failed', (error as { code?: number }).code);
    return { status: 'unavailable', byPostId };
  }
}
