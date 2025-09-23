import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = process.env.BQ_PROJECT_ID ?? 'mark-454114';
const DATASET = 'autostudio_threads';
const SCORES_TABLE = 'threads_prompt_template_scores';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const client = new BigQuery({
  projectId: PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

async function ensureScoresTable() {
  const dataset = client.dataset(DATASET);
  const table = dataset.table(SCORES_TABLE);
  const [exists] = await table.exists();
  if (!exists) {
    await table.create({
      schema: [
        { name: 'template_id', type: 'STRING' },
        { name: 'generated_at', type: 'TIMESTAMP' },
        { name: 'impression_avg72h', type: 'FLOAT64' },
        { name: 'like_avg72h', type: 'FLOAT64' },
        { name: 'follower_delta', type: 'FLOAT64' },
        { name: 'status', type: 'STRING' },
        { name: 'notes', type: 'STRING' },
      ],
    });
  }
}

async function fetchTemplateMetrics() {
  const sql = `
    WITH logs AS (
      SELECT
        l.plan_id,
        l.posted_thread_id,
        l.posted_at,
        p.template_id
      FROM \`${PROJECT_ID}.${DATASET}.thread_posting_logs\` l
      JOIN \`${PROJECT_ID}.${DATASET}.thread_post_plans\` p
        ON l.plan_id = p.plan_id
      WHERE l.status = 'succeeded'
        AND l.posted_thread_id IS NOT NULL
        AND l.posted_thread_id != ''
        AND l.posted_at <= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 72 HOUR)
    ),
    metrics AS (
      SELECT
        template_id,
        AVG(tp.impressions_total) AS avg_impressions,
        AVG(tp.likes_total) AS avg_likes,
        COUNT(*) AS post_count
      FROM logs
      JOIN \`${PROJECT_ID}.${DATASET}.threads_posts\` tp
        ON tp.post_id = logs.posted_thread_id
      WHERE template_id IS NOT NULL
      GROUP BY template_id
    )
    SELECT * FROM metrics
  `;

  const [rows] = await client.query({ query: sql });
  return rows as Array<{ template_id: string; avg_impressions: number; avg_likes: number; post_count: number }>;
}

async function insertScores(rows: Array<{ template_id: string; avg_impressions: number; avg_likes: number; post_count: number }>) {
  if (!rows.length) {
    console.log('No template metrics eligible for update.');
    return;
  }
  const dataset = client.dataset(DATASET);
  await dataset.table(SCORES_TABLE).insert(
    rows.map((row) => ({
      template_id: row.template_id,
      generated_at: new Date(),
      impression_avg72h: row.avg_impressions,
      like_avg72h: row.avg_likes,
      follower_delta: null,
      status: 'calculated',
      notes: `posts=${row.post_count}`,
    })),
  );
  console.log(`Inserted ${rows.length} template score rows.`);
}

async function main() {
  await ensureScoresTable();
  const metrics = await fetchTemplateMetrics();
  await insertScores(metrics);
}

main().catch((error) => {
  console.error('Template score update failed', error);
  process.exitCode = 1;
});
