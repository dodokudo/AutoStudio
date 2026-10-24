import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });

async function main() {
  const { createBigQueryClient } = await import('../lib/bigquery');
  const { supplementalMergeSql } = await import('../lib/threadsSupplementalInsights');
  const { validateSupplementalBatch } = await import('../lib/threadsSupplementalMetrics');
  const client = createBigQueryClient();
  const tableSql = readFileSync('sql/threads-post-insights-snapshot.sql', 'utf8')
    .replace(/CREATE TABLE IF NOT EXISTS `[^`]+`/, 'CREATE TEMP TABLE snapshots')
    .replace(/PARTITION BY snapshot_date\s+CLUSTER BY account_key, post_id;/, ';');
  const row = (snapshot_at: string, follows: number, profile_visits: number | null = null) =>
    validateSupplementalBatch({ source: 'muse_threads', account_username: 'kudooo_ai', snapshots: [{
      snapshot_at, follows, profile_visits, post_id: '123',
      post_url: 'https://www.threads.com/@kudooo_ai/post/Test123',
    }] }, new Date('2026-10-24T12:00:00Z')).snapshots.map((snapshot) => ({ ...snapshot, root_post_id: '123', node_type: 'post' }));
  const merge = (parameter: string) => supplementalMergeSql('snapshots').replace('@snapshots', `@${parameter}`);
  const query = `
    DECLARE conflict_rejected BOOL DEFAULT FALSE;
    ${tableSql}
    ${merge('first')}
    ${merge('first')}
    ASSERT (SELECT COUNT(*) FROM snapshots) = 1 AS 'retry duplicated a snapshot';
    ASSERT (SELECT follows = 0 AND profile_visits IS NULL FROM snapshots) AS 'zero/null corrupted';
    ${merge('newer')}
    ${merge('first')}
    ASSERT (SELECT follows = 27 AND profile_visits = 1660 FROM snapshots) AS 'stale retry overwrote newer data';
    BEGIN
      ${merge('conflict')}
    EXCEPTION WHEN ERROR THEN
      SET conflict_rejected = TRUE;
    END;
    ASSERT conflict_rejected AS 'same observation accepted conflicting metrics';
    ${merge('next_day')}
    ASSERT (SELECT COUNT(*) FROM snapshots) = 2 AS 'daily history lost';
    ASSERT (SELECT follows = 28 FROM snapshots WHERE snapshot_date = '2026-10-24') AS 'JST date incorrect';
    SELECT COUNT(*) AS snapshots, SUM(follows) AS follows FROM snapshots;
  `;
  const [job] = await client.createQueryJob({
    query, location: 'asia-northeast1', maximumBytesBilled: '1000000000',
    params: {
      first: JSON.stringify(row('2026-10-23T01:00:00Z', 0)),
      newer: JSON.stringify(row('2026-10-23T02:00:00Z', 27, 1660)),
      conflict: JSON.stringify(row('2026-10-23T02:00:00Z', 999, 1660)),
      next_day: JSON.stringify(row('2026-10-23T15:00:00Z', 28, 1700)),
    },
  });
  const [rows] = await job.getQueryResults();
  assert.equal(rows[0].snapshots, 2);
  assert.equal(rows[0].follows, 55);
  console.log(JSON.stringify({ ok: true, jobId: job.id, temporaryTablesOnly: true, checks: ['retry', 'zero/null', 'stale retry', 'conflicting timestamp', 'daily history', 'JST date'] }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
