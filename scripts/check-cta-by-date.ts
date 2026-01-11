import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.prod') });

const PROJECT_ID = 'mark-454114';

async function check() {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');
  const jsonString = rawJson.startsWith('{') ? rawJson : Buffer.from(rawJson, 'base64').toString('utf8');
  const credentials = JSON.parse(jsonString);
  if (credentials.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');

  const bigquery = new BigQuery({ projectId: PROJECT_ID, credentials, location: 'US' });

  // 各日のCTA URL含むコメント数
  const [ctaCounts] = await bigquery.query({
    query: `
      SELECT
        DATE(timestamp) as date,
        COUNT(*) as total_comments,
        COUNTIF(LOWER(text) LIKE '%autostudio-self.vercel.app%') as cta_comments,
        SUM(CASE WHEN LOWER(text) LIKE '%autostudio-self.vercel.app%' THEN views ELSE 0 END) as cta_views
      FROM \`${PROJECT_ID}.autostudio_threads.threads_comments\`
      WHERE DATE(timestamp) BETWEEN '2025-11-28' AND '2025-12-11'
      GROUP BY DATE(timestamp)
      ORDER BY date
    `
  });

  console.log('日別CTA状況:');
  console.log('日付          全コメント  CTAコメント  CTA閲覧数');
  for (const r of ctaCounts as any[]) {
    console.log(`${r.date.value}   ${String(r.total_comments).padStart(10)}  ${String(r.cta_comments).padStart(10)}  ${String(r.cta_views).padStart(10)}`);
  }

  // 11月28日のコメントサンプル
  const [nov28] = await bigquery.query({
    query: `
      SELECT
        comment_id,
        views,
        CAST(timestamp AS STRING) as timestamp,
        text
      FROM \`${PROJECT_ID}.autostudio_threads.threads_comments\`
      WHERE DATE(timestamp) = '2025-11-28'
      ORDER BY timestamp
      LIMIT 10
    `
  });

  console.log('\n11月28日のコメントサンプル:');
  for (const r of nov28 as any[]) {
    const hasCta = r.text?.toLowerCase().includes('autostudio-self.vercel.app');
    console.log(`[${r.timestamp}] views:${r.views} CTA:${hasCta ? '★' : '-'}`);
    console.log(`  ${r.text?.substring(0, 80)}...`);
  }
}

check().catch(console.error);
