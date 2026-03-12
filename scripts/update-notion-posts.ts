import * as fs from "fs";
import * as path from "path";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env.local") });

// Notion MCP経由でページを更新するため、生成したJSONをMarkdown形式で出力
// その後、手動またはスクリプトでNotion APIを呼び出す

interface Post {
  index: number;
  hook: string;
  comment1: string;
  comment2: string;
}

async function main() {
  const postsPath = path.resolve(process.cwd(), "generated-operation-posts.json");
  const posts: Post[] = JSON.parse(fs.readFileSync(postsPath, "utf-8"));

  console.log(`=== Notion更新用データ作成 ===`);
  console.log(`投稿数: ${posts.length}件\n`);

  // 更新用のMarkdownを生成
  const outputData = posts.map(post => ({
    index: post.index,
    hook: post.hook,
    content: `## メイン投稿
${post.hook}
---
## コメント1
${post.comment1.replace(/\\n/g, '\n')}
---
## コメント2
${post.comment2.replace(/\\n/g, '\n')}`
  }));

  const outputPath = path.resolve(process.cwd(), "notion-update-data.json");
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), "utf-8");

  console.log(`保存先: ${outputPath}`);

  // サンプル表示
  console.log(`\n=== サンプル（1件目）===\n`);
  console.log(outputData[0].content);
}

main().catch(console.error);
