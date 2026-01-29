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
      CAST(post_date AS DATE) as date,
      impressions,
      content
    FROM \`mark-454114.autostudio_threads.competitor_posts_raw\`
    WHERE account_name = '門口 拓也'
      AND post_date >= '2025-11-01'
      AND impressions IS NOT NULL
      AND impressions > 0
    ORDER BY impressions DESC
    LIMIT 30
  `;

  const [rows] = await client.query({ query });

  let output = "# 門口拓也さんの投稿 トップ30（2025年11月〜2026年1月）\n\n";
  output += "閲覧数順\n\n";

  rows.forEach((row: any, i: number) => {
    const date = row.date?.value || row.date;
    const impressions = row.impressions;
    const content = row.content || "";

    output += `## 【${i + 1}位】閲覧数: ${impressions.toLocaleString()}\n`;
    output += `**日付:** ${date}\n\n`;
    output += `${content}\n\n`;
    output += `---\n\n`;
  });

  const outputPath = path.resolve(process.cwd(), "analysis/threads/門口拓也_トップ30_11月-1月.md");
  fs.writeFileSync(outputPath, output, "utf-8");
  console.log(`✅ 出力完了: ${outputPath}`);
}

main().catch(console.error);
