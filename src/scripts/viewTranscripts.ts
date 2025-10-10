import { config } from 'dotenv';
import path from 'path';
config();
config({ path: path.resolve(process.cwd(), '.env.local') });

import { createInstagramBigQuery } from '@/lib/instagram/bigquery';
import { loadInstagramConfig } from '@/lib/instagram';

async function main() {
  const instagramConfig = loadInstagramConfig();
  const bigquery = createInstagramBigQuery();

  const query = `
    SELECT
      snapshot_date,
      instagram_media_id,
      summary,
      key_points,
      hooks,
      cta_ideas
    FROM \`${instagramConfig.projectId}.${instagramConfig.dataset}.competitor_reels_transcripts\`
    ORDER BY snapshot_date DESC
    LIMIT 10
  `;

  const [rows] = await bigquery.query({ query });

  console.log(`\n📝 最新の文字起こしデータ (${rows.length}件)\n`);

  rows.forEach((row: any, index: number) => {
    console.log(`\n━━━ [${index + 1}] ${row.instagram_media_id} ━━━`);
    console.log(`📅 日付: ${row.snapshot_date.value}`);
    console.log(`\n📋 要約:`);
    console.log(row.summary);

    if (row.key_points && row.key_points.length > 0) {
      console.log(`\n🔑 キーポイント:`);
      row.key_points.forEach((point: string, i: number) => {
        console.log(`  ${i + 1}. ${point}`);
      });
    }

    if (row.hooks && row.hooks.length > 0) {
      console.log(`\n🎣 フック（掴み）:`);
      row.hooks.forEach((hook: string, i: number) => {
        console.log(`  ${i + 1}. ${hook}`);
      });
    }

    if (row.cta_ideas && row.cta_ideas.length > 0) {
      console.log(`\n📢 CTA案:`);
      row.cta_ideas.forEach((cta: string, i: number) => {
        console.log(`  ${i + 1}. ${cta}`);
      });
    }
  });

  // 統計情報
  const countQuery = `
    SELECT COUNT(*) as total
    FROM \`${instagramConfig.projectId}.${instagramConfig.dataset}.competitor_reels_transcripts\`
  `;
  const [countRows] = await bigquery.query({ query: countQuery });
  console.log(`\n\n📊 統計: 合計 ${countRows[0].total} 件の文字起こしデータ\n`);
}

main().catch(console.error);
