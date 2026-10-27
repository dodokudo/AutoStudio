import { randomUUID } from 'node:crypto';
import { createBigQueryClient, resolveProjectId } from './bigquery';

export async function createThreadsDriveImportState() {
  const client = createBigQueryClient();
  const dataset = `${resolveProjectId()}.autostudio_threads`;
  const lock = `\`${dataset}.threads_drive_import_lock\``;
  const files = `\`${dataset}.threads_drive_import_files\``;
  const owner = randomUUID();
  const query = async (sql: string, params?: Record<string, string | number>) =>
    (await client.query({ query: sql, params, location: 'asia-northeast1', maximumBytesBilled: '1000000000' }))[0];
  await query(`CREATE TABLE IF NOT EXISTS ${lock} AS
    SELECT CAST(NULL AS STRING) AS owner, TIMESTAMP '1970-01-01 00:00:00+00' AS expires_at;
    CREATE TABLE IF NOT EXISTS ${files} (
      file_id STRING, version STRING, imported_at TIMESTAMP, row_count INT64, report_json STRING
    );`);
  // Cloud Run times out after 15 minutes; this lease outlives even a killed task.
  const acquired = await query(`DECLARE acquired_count INT64;
    BEGIN TRANSACTION;
    UPDATE ${lock} SET owner = @owner, expires_at = TIMESTAMP_ADD(CURRENT_TIMESTAMP(), INTERVAL 30 MINUTE)
    WHERE expires_at < CURRENT_TIMESTAMP();
    SET acquired_count = @@row_count;
    COMMIT TRANSACTION;
    SELECT acquired_count AS acquired;`, { owner });
  if (Number(acquired[0]?.acquired) === 0) return null;
  if (Number(acquired[0]?.acquired) !== 1) throw new Error('Drive import lock state is invalid');
  return {
    async alreadyImported(fileId: string, version: string) {
      return (await query(`SELECT file_id FROM ${files} WHERE file_id = @fileId AND version = @version
        AND COALESCE(ARRAY_LENGTH(JSON_QUERY_ARRAY(report_json, '$.pending')), 0) = 0`, { fileId, version })).length > 0;
    },
    async complete(fileId: string, version: string, rowCount: number, report: unknown) {
      await query(`MERGE ${files} T USING (SELECT @fileId AS file_id) S ON T.file_id = S.file_id
        WHEN MATCHED THEN UPDATE SET version = @version, imported_at = CURRENT_TIMESTAMP(), row_count = @rowCount, report_json = @report
        WHEN NOT MATCHED THEN INSERT (file_id, version, imported_at, row_count, report_json)
          VALUES (@fileId, @version, CURRENT_TIMESTAMP(), @rowCount, @report)`,
      { fileId, version, rowCount, report: JSON.stringify(report) });
    },
    async release() {
      await query(`UPDATE ${lock} SET owner = NULL, expires_at = TIMESTAMP '1970-01-01 00:00:00+00' WHERE owner = @owner`, { owner });
    },
  };
}
