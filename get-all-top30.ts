import { config as loadEnv } from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { createBigQueryClient } from "./src/lib/bigquery";

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

async function main() {
  const client = createBigQueryClient("mark-454114");

  const query = `
    SELECT
      account_name,
      CAST(post_date AS DATE) as date,
      impressions,
      content
    FROM \`mark-454114.autostudio_threads.competitor_posts_raw\`
    WHERE post_date >= '2025-11-01'
      AND impressions IS NOT NULL
      AND impressions > 0
    ORDER BY impressions DESC
    LIMIT 50
  `;

  const [rows] = await client.query({ query });

  let output = "# 競合全体 閲覧数トップ50（2025年11月〜2026年1月）\n\n";

  rows.forEach((row: any, i: number) => {
    const date = row.date?.value || row.date;
    const impressions = row.impressions;
    const content = row.content || "";
    const account = row.account_name;

    output += `## 【${i + 1}位】閲覧数: ${impressions.toLocaleString()}\n`;
    output += `**投稿者:** ${account}\n`;
    output += `**日付:** ${date}\n\n`;
    output += `${content}\n\n`;
    output += `---\n\n`;
  });

  const outputPath = path.resolve(process.cwd(), "analysis/threads/競合全体_トップ50_11月-1月.md");
  fs.writeFileSync(outputPath, output, "utf-8");
  console.log(`✅ 出力完了: ${outputPath}`);

  // コンソールにも出力
  rows.forEach((row: any, i: number) => {
    const date = row.date?.value || row.date;
    const impressions = row.impressions;
    const content = row.content || "";
    const account = row.account_name;

    console.log(`\n【${i + 1}位】閲覧数: ${impressions.toLocaleString()}`);
    console.log(`投稿者: ${account}`);
    console.log(`日付: ${date}`);
    console.log(`---`);
    console.log(content);
    console.log(`\n${"=".repeat(60)}`);
  });
}

main().catch(console.error);
