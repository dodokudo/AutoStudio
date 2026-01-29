import { config as loadEnv } from "dotenv";
import path from "node:path";
import { createBigQueryClient } from "./src/lib/bigquery";

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

async function check() {
  const client = createBigQueryClient("mark-454114");

  // 1月のデータを明示的に検索
  const query = `
    SELECT
      CAST(post_date AS STRING) as post_date_str,
      account_name
    FROM \`mark-454114.autostudio_threads.competitor_posts_raw\`
    WHERE EXTRACT(MONTH FROM post_date) = 1 AND EXTRACT(YEAR FROM post_date) = 2026
    LIMIT 10
  `;

  console.log("BigQuery 2026年1月のデータ:");
  const [rows] = await client.query({ query });
  console.log("件数:", rows.length);
  rows.forEach((r: any) => console.log(r.post_date_str, r.account_name));

  // 全体の月別件数
  const countQuery = `
    SELECT
      FORMAT_DATE('%Y-%m', post_date) as month,
      COUNT(*) as cnt
    FROM \`mark-454114.autostudio_threads.competitor_posts_raw\`
    GROUP BY month
    ORDER BY month DESC
    LIMIT 20
  `;

  console.log("\n\n月別件数:");
  const [counts] = await client.query({ query: countQuery });
  counts.forEach((r: any) => console.log(`  ${r.month}: ${r.cnt}件`));
}

check().catch(console.error);
