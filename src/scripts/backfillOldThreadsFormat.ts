/**
 * 旧Spreadsheet由来のThreads投稿（2026/2月以前）を新API形式に正規化する。
 *
 * - threads_posts.content から【メイン投稿】部分だけ抽出して更新
 * - 【コメント欄1〜7】の中身を threads_comments に追加
 * - 既存と完全一致するコメントはスキップ、500字超は500字に自動切り詰め
 *
 * Usage:
 *   DRY_RUN=true npx tsx src/scripts/backfillOldThreadsFormat.ts   # 集計のみ
 *   DRY_RUN=false npx tsx src/scripts/backfillOldThreadsFormat.ts  # 本番実行
 */

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createBigQueryClient } from '../lib/bigquery';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const PROJECT_ID = 'mark-454114';
const DATASET_ID = 'autostudio_threads';
const POSTS_TABLE = `\`${PROJECT_ID}.${DATASET_ID}.threads_posts\``;
const COMMENTS_TABLE = `\`${PROJECT_ID}.${DATASET_ID}.threads_comments\``;

const DRY_RUN = process.env.DRY_RUN !== 'false';
const CUTOFF_DATE = '2026-02-01';

/** 旧投稿のcontentからメイン投稿部分のみ抽出するSQL式 */
const EXTRACT_MAIN_SQL = `
  TRIM(
    SUBSTR(content,
      STRPOS(content, "【メイン投稿】") + CHAR_LENGTH("【メイン投稿】"),
      GREATEST(
        COALESCE(NULLIF(STRPOS(content, "【コメント欄1】"), 0), CHAR_LENGTH(content) + 1)
          - STRPOS(content, "【メイン投稿】") - CHAR_LENGTH("【メイン投稿】"),
        0
      )
    )
  )
`;

/** コメント欄1〜7をUNION ALLで縦展開するSQL */
function buildExpandedCommentsCTE(): string {
  const slots = [1, 2, 3, 4, 5, 6, 7];
  const unions = slots
    .map((n) => {
      const next = n + 1;
      const nextLabel = next <= 7 ? `【コメント欄${next}】` : null;
      const endExpr = nextLabel
        ? `COALESCE(NULLIF(STRPOS(content, "${nextLabel}"), 0), CHAR_LENGTH(content) + 1)`
        : `CHAR_LENGTH(content) + 1`;
      return `
        SELECT
          post_id,
          posted_at,
          ${n} AS slot,
          TRIM(SUBSTR(
            content,
            STRPOS(content, "【コメント欄${n}】") + CHAR_LENGTH("【コメント欄${n}】"),
            ${endExpr} - STRPOS(content, "【コメント欄${n}】") - CHAR_LENGTH("【コメント欄${n}】")
          )) AS raw_text
        FROM old_posts
        WHERE STRPOS(content, "【コメント欄${n}】") > 0
      `;
    })
    .join('\nUNION ALL\n');
  return `
    expanded AS (
      ${unions}
    )
  `;
}

async function main() {
  console.log(`[backfill] mode = ${DRY_RUN ? 'DRY_RUN' : 'PRODUCTION'}`);
  const bq = createBigQueryClient(PROJECT_ID);

  // ===========================================================================
  // 1. 集計クエリ（更新対象件数、INSERT対象件数、切り詰め件数）
  // ===========================================================================
  const summarySql = `
    WITH old_posts AS (
      SELECT post_id, posted_at, content
      FROM ${POSTS_TABLE}
      WHERE DATE(posted_at, "Asia/Tokyo") < DATE "${CUTOFF_DATE}"
        AND content LIKE "%【メイン投稿】%"
    ),
    ${buildExpandedCommentsCTE()},
    candidates AS (
      SELECT
        post_id,
        posted_at,
        slot,
        raw_text,
        SUBSTR(raw_text, 1, 500) AS truncated_text,
        CHAR_LENGTH(raw_text) AS raw_len,
        EXISTS (
          SELECT 1 FROM ${COMMENTS_TABLE} c
          WHERE c.parent_post_id = expanded.post_id
            AND TRIM(c.text) = expanded.raw_text
        ) AS already_exists
      FROM expanded
    )
    SELECT
      (SELECT COUNT(*) FROM old_posts) AS posts_to_update,
      (SELECT COUNT(*) FROM expanded) AS total_slots,
      COUNTIF(already_exists) AS skip_existing,
      COUNTIF(NOT already_exists) AS will_insert,
      COUNTIF(NOT already_exists AND raw_len > 500) AS will_truncate
    FROM candidates
  `;
  const [summary] = await bq.query({ query: summarySql });
  console.log('[backfill] summary:', JSON.stringify(summary[0], null, 2));

  // ===========================================================================
  // 2. サンプル出力（更新前後）
  // ===========================================================================
  const sampleSql = `
    WITH old_posts AS (
      SELECT post_id, posted_at, content
      FROM ${POSTS_TABLE}
      WHERE DATE(posted_at, "Asia/Tokyo") < DATE "${CUTOFF_DATE}"
        AND content LIKE "%【メイン投稿】%"
      LIMIT 3
    )
    SELECT
      post_id,
      CHAR_LENGTH(content) AS orig_len,
      CHAR_LENGTH(${EXTRACT_MAIN_SQL}) AS new_len,
      SUBSTR(content, 1, 60) AS orig_head,
      SUBSTR(${EXTRACT_MAIN_SQL}, 1, 60) AS new_head
    FROM old_posts
  `;
  const [samples] = await bq.query({ query: sampleSql });
  console.log('[backfill] content update samples:');
  samples.forEach((s: Record<string, unknown>) => console.log(JSON.stringify(s, null, 2)));

  // ===========================================================================
  // 3. 切り詰めリスト
  // ===========================================================================
  const truncateSql = `
    WITH old_posts AS (
      SELECT post_id, posted_at, content
      FROM ${POSTS_TABLE}
      WHERE DATE(posted_at, "Asia/Tokyo") < DATE "${CUTOFF_DATE}"
        AND content LIKE "%【メイン投稿】%"
    ),
    ${buildExpandedCommentsCTE()}
    SELECT post_id, slot, CHAR_LENGTH(raw_text) AS len
    FROM expanded
    WHERE CHAR_LENGTH(raw_text) > 500
      AND NOT EXISTS (
        SELECT 1 FROM ${COMMENTS_TABLE} c
        WHERE c.parent_post_id = expanded.post_id AND TRIM(c.text) = expanded.raw_text
      )
    ORDER BY len DESC
    LIMIT 10
  `;
  const [trunc] = await bq.query({ query: truncateSql });
  console.log('[backfill] truncate candidates (top 10):');
  trunc.forEach((t: Record<string, unknown>) => console.log(JSON.stringify(t)));

  if (DRY_RUN) {
    console.log('[backfill] DRY_RUN finished. No data modified.');
    return;
  }

  // ===========================================================================
  // 4. 本番更新: threads_posts.content
  // ===========================================================================
  console.log('[backfill] Updating threads_posts.content ...');
  const updateSql = `
    UPDATE ${POSTS_TABLE}
    SET content = ${EXTRACT_MAIN_SQL}
    WHERE DATE(posted_at, "Asia/Tokyo") < DATE "${CUTOFF_DATE}"
      AND content LIKE "%【メイン投稿】%"
  `;
  const [updateJob] = await bq.createQueryJob({ query: updateSql });
  await updateJob.getQueryResults();
  console.log('[backfill] threads_posts updated.');

  // ===========================================================================
  // 5. 本番INSERT: threads_comments
  // ===========================================================================
  console.log('[backfill] Inserting threads_comments ...');
  const insertSql = `
    INSERT INTO ${COMMENTS_TABLE}
      (comment_id, parent_post_id, text, timestamp, permalink, has_replies, depth, views, created_at, updated_at)
    WITH old_posts AS (
      -- 注意: 既にメイン投稿だけにUPDATE済みなので、ここではバックアップから読む
      SELECT post_id, posted_at, content
      FROM \`${PROJECT_ID}.${DATASET_ID}.threads_posts_backup_20260524\`
      WHERE DATE(posted_at, "Asia/Tokyo") < DATE "${CUTOFF_DATE}"
        AND content LIKE "%【メイン投稿】%"
    ),
    ${buildExpandedCommentsCTE()}
    SELECT
      CONCAT("legacy:", expanded.post_id, ":c", CAST(slot AS STRING)) AS comment_id,
      expanded.post_id AS parent_post_id,
      SUBSTR(raw_text, 1, 500) AS text,
      TIMESTAMP_ADD(expanded.posted_at, INTERVAL slot SECOND) AS timestamp,
      CAST(NULL AS STRING) AS permalink,
      FALSE AS has_replies,
      0 AS depth,
      0 AS views,
      CURRENT_TIMESTAMP() AS created_at,
      CURRENT_TIMESTAMP() AS updated_at
    FROM expanded
    WHERE NOT EXISTS (
      SELECT 1 FROM ${COMMENTS_TABLE} c
      WHERE c.parent_post_id = expanded.post_id AND TRIM(c.text) = expanded.raw_text
    )
  `;
  const [insertJob] = await bq.createQueryJob({ query: insertSql });
  await insertJob.getQueryResults();
  console.log('[backfill] threads_comments inserted.');

  // ===========================================================================
  // 6. 事後検証
  // ===========================================================================
  const verifySql = `
    SELECT
      (SELECT COUNT(*) FROM ${POSTS_TABLE} WHERE content LIKE "%【コメント欄%") AS posts_with_comment_label,
      (SELECT COUNT(*) FROM ${POSTS_TABLE} WHERE content LIKE "%【メイン投稿%") AS posts_with_main_label,
      (SELECT COUNT(*) FROM ${COMMENTS_TABLE} WHERE STARTS_WITH(comment_id, "legacy:")) AS legacy_comments,
      (SELECT COUNT(*) FROM ${COMMENTS_TABLE}) AS total_comments
  `;
  const [verify] = await bq.query({ query: verifySql });
  console.log('[backfill] verification:', JSON.stringify(verify[0], null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfill] FATAL:', err);
    process.exit(1);
  });
