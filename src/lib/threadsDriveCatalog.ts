import { createBigQueryClient, resolveProjectId } from './bigquery';
import { planDriveReplyRegistrations, type DriveCatalogEntry, type DriveSnapshot } from './threadsDriveCsv';

const dataset = `${resolveProjectId()}.autostudio_threads`;
const table = `\`${dataset}.threads_drive_replies\``;

export async function prepareDriveReplies(rows: DriveSnapshot[], write: boolean) {
  const client = createBigQueryClient();
  const [exists] = await client.dataset('autostudio_threads').table('threads_drive_replies').exists();
  if (write && !exists) await client.query({ query: `CREATE TABLE IF NOT EXISTS ${table} (
    post_id STRING, root_post_id STRING, post_url STRING, posted_at TIMESTAMP, caption STRING,
    views INT64, snapshot_at TIMESTAMP, source_file_id STRING, source_file_version STRING, payload_json STRING
  )`, location: 'asia-northeast1' });
  const [entries] = await client.query({ query: `
    SELECT post_id, permalink, post_id AS root_post_id, 'post' AS node_type, COALESCE(account_key, 'main') AS account_key, FALSE AS from_drive
      FROM \`${dataset}.threads_posts\`
    UNION ALL SELECT comment_id, permalink, parent_post_id, 'reply', COALESCE(account_key, 'main'), FALSE
      FROM \`${dataset}.threads_comments\`
    ${exists || write ? `UNION ALL SELECT post_id, post_url, root_post_id, 'reply', 'main', TRUE FROM ${table}` : ''}`,
    location: 'asia-northeast1', maximumBytesBilled: '1000000000' });
  const registrations = planDriveReplyRegistrations(rows, entries as DriveCatalogEntry[]);
  const refresh = rows.filter((row) => row.is_self_reply === true && entries.some((entry) => entry.from_drive &&
    entry.post_id === row.post_id && entry.permalink === row.post_url && entry.root_post_id === row.parent_post_id));
  const incoming = [...registrations, ...refresh];
  if (write && incoming.length) {
    await client.query({ query: `
      CREATE TEMP TABLE incoming AS SELECT JSON_VALUE(r, '$.post_id') AS post_id,
        JSON_VALUE(r, '$.parent_post_id') AS root_post_id, JSON_VALUE(r, '$.post_url') AS post_url,
        TIMESTAMP(JSON_VALUE(r, '$.posted_at')) AS posted_at, JSON_VALUE(r, '$.caption') AS caption,
        CAST(JSON_VALUE(r, '$.views') AS INT64) AS views, TIMESTAMP(JSON_VALUE(r, '$.snapshot_at')) AS snapshot_at,
        JSON_VALUE(r, '$.drive_file_id') AS source_file_id, JSON_VALUE(r, '$.drive_file_version') AS source_file_version,
        TO_JSON_STRING(r) AS payload_json FROM UNNEST(JSON_QUERY_ARRAY(PARSE_JSON(@rows))) r;
      ASSERT NOT EXISTS (SELECT 1 FROM incoming S JOIN ${table} T ON T.post_id = S.post_id OR T.post_url = S.post_url
        WHERE T.post_id != S.post_id OR T.post_url != S.post_url OR T.root_post_id != S.root_post_id)
        AS 'Conflicting Drive reply identity';
      MERGE ${table} T USING incoming S ON T.post_id = S.post_id
        WHEN MATCHED AND S.snapshot_at >= T.snapshot_at THEN UPDATE SET
          posted_at = COALESCE(S.posted_at, T.posted_at), caption = S.caption,
          views = IF(S.snapshot_at > T.snapshot_at, S.views, T.views), snapshot_at = S.snapshot_at,
          source_file_id = S.source_file_id, source_file_version = S.source_file_version, payload_json = S.payload_json
        WHEN NOT MATCHED THEN INSERT ROW;`,
      params: { rows: JSON.stringify(incoming) }, location: 'asia-northeast1', maximumBytesBilled: '1000000000' });
  }
  return registrations.map((row) => ({ post_id: row.post_id!, permalink: row.post_url,
    root_post_id: row.parent_post_id!, node_type: 'reply' as const }));
}
