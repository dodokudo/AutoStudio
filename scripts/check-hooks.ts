import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const bigquery = new BigQuery({ projectId: 'mark-454114' });

async function main() {
  const [rows] = await bigquery.query({
    query: `
      SELECT content, impressions_total
      FROM \`mark-454114.autostudio_threads.threads_posts\`
      WHERE post_id IS NOT NULL AND post_id != ''
        AND DATE(posted_at) >= '2025-11-14'
      ORDER BY impressions_total DESC
      LIMIT 10
    `,
  });

  rows.forEach((row: any, i: number) => {
    const content = row.content || '';
    const lines = content.split('\n').filter((l: string) => l.trim());
    const firstLine = lines[0] || '';

    console.log(`\n=== ${i+1}. ${row.impressions_total}imp ===`);
    console.log('1行目:', firstLine);
  });
}

main();
