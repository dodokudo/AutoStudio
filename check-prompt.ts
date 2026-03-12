import { BigQuery } from "@google-cloud/bigquery";
import * as fs from "fs";

async function main() {
  const bq = new BigQuery({
    projectId: "mark-454114",
    keyFilename: "/Users/kudo/AutoStudio/secrets/mark-454114-bf1f1fa80b94.json"
  });

  // 最新のプロンプトを取得
  console.log("=== 投稿作成プロンプト ===\n");
  const [rows] = await bq.query({
    query: `
      SELECT version, prompt_text, created_at
      FROM \`mark-454114.autostudio_threads.threads_prompt_settings\`
      ORDER BY version DESC
      LIMIT 1
    `
  });

  if (rows.length > 0) {
    const row = rows[0] as any;
    console.log(`Version: ${row.version}`);
    console.log(`Created: ${row.created_at}`);
    console.log(`\n--- プロンプト内容 ---\n`);
    console.log(row.prompt_text);
  } else {
    console.log("プロンプトが見つかりません");
  }

  // 生成した投稿の文字数を確認
  console.log("\n\n=== 生成した投稿の文字数確認 ===\n");
  const postsJson = fs.readFileSync("/Users/kudo/AutoStudio/generated-posts.json", "utf-8");
  const posts = JSON.parse(postsJson);

  for (const post of posts.slice(0, 5)) {
    console.log(`[${post.index}] ${post.hook.substring(0, 30)}...`);
    console.log(`  コメント1: ${post.comment1.length}文字`);
    console.log(`  コメント2: ${post.comment2.length}文字`);
  }
}

main().catch(console.error);
