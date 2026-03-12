import { BigQuery } from "@google-cloud/bigquery";

async function main() {
  const bq = new BigQuery({
    projectId: "mark-454114",
    keyFilename: "/Users/kudo/AutoStudio/secrets/mark-454114-bf1f1fa80b94.json"
  });

  // 実際のバズった投稿を取得して形式を確認
  console.log("=== 実際のバズった投稿サンプル ===\n");
  const [rows] = await bq.query({
    query: `
      SELECT
        post_id,
        content,
        impressions_total
      FROM \`mark-454114.autostudio_threads.threads_posts\`
      WHERE impressions_total >= 5000
        AND DATE(posted_at) >= '2025-11-01'
      ORDER BY impressions_total DESC
      LIMIT 3
    `
  });

  for (const row of rows as any[]) {
    console.log(`--- インプ: ${row.impressions_total} ---`);
    console.log(row.content);
    console.log(`\n文字数: ${row.content.length}文字\n`);
    console.log("=".repeat(50));
  }
}

main().catch(console.error);
