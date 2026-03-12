import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env.local") });

const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
const client = new Anthropic({ apiKey: apiKey! });

const MISSING_HOOKS = [
  { index: 82, hook: "あのー、Threadsは1日1投稿だと伸びないですよ。" },
  { index: 88, hook: "Threadsで集客できない人とできる人、決定的な差があります。" }
];

async function generatePost(hook: string, index: number) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2000,
    temperature: 0.9,
    system: "あなたはThreads運用のプロです。JSONのみ返してください。絵文字禁止。",
    messages: [{
      role: "user",
      content: `フック: ${hook}

このフックに続くコメント1・コメント2を生成してください。

【コメント1】420〜480文字
- 「2ヶ月でフォロワー2500名、167万インプ達成した」という実績から始める
- 体験談（「僕も最初は○○だったけど」）を入れる
- 基本ノウハウ①②③を入れる
- 最後に「じゃあ具体的にどうすればいいかっていうと▼」で締める

【コメント2】420〜480文字
- 応用テクニックを詳しく説明
- 注意点①②を入れる
- 今日から試せる具体的なステップを書く
- 短い締めの言葉

JSONのみ返してください:
{"comment1": "...", "comment2": "..."}`
    }]
  });

  const text = (response.content[0] as { type: string; text: string }).text;
  let jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  // 改行をエスケープ
  let inString = false;
  let escaped = "";
  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];
    const prevChar = i > 0 ? jsonStr[i-1] : "";
    if (char === '"' && prevChar !== '\\') {
      inString = !inString;
      escaped += char;
    } else if (inString && char === '\n') {
      escaped += '\\n';
    } else if (inString && char === '\r') {
      // skip
    } else {
      escaped += char;
    }
  }

  const parsed = JSON.parse(escaped);
  return {
    index,
    hook,
    comment1: parsed.comment1,
    comment2: parsed.comment2,
    comment1Length: parsed.comment1.length,
    comment2Length: parsed.comment2.length
  };
}

async function main() {
  console.log("=== 不足分を生成 ===\n");

  const existingPath = path.resolve(process.cwd(), "generated-operation-posts.json");
  const existing = JSON.parse(fs.readFileSync(existingPath, "utf-8"));

  for (const { index, hook } of MISSING_HOOKS) {
    console.log(`生成中: [${index}] ${hook.substring(0, 30)}...`);
    try {
      const result = await generatePost(hook, index);
      existing.push(result);
      console.log(`  OK - コメント1: ${result.comment1Length}文字, コメント2: ${result.comment2Length}文字`);
    } catch (err: any) {
      console.error(`  エラー: ${err.message}`);
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  // indexでソート
  existing.sort((a: any, b: any) => a.index - b.index);

  fs.writeFileSync(existingPath, JSON.stringify(existing, null, 2), "utf-8");
  console.log(`\n完了: ${existing.length}件保存`);
}

main().catch(console.error);
