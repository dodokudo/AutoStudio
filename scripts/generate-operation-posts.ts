import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";
import { config } from "dotenv";

// .env.local を読み込む
config({ path: path.resolve(process.cwd(), ".env.local") });

const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  throw new Error("CLAUDE_API_KEY or ANTHROPIC_API_KEY is required");
}

const client = new Anthropic({ apiKey });

// Threads運用プロンプト（threadsOperationPrompt.tsから抜粋した重要部分）
const THREADS_OPERATION_SYSTEM = `あなたは工藤さんのThreads投稿を完璧に再現するプロのThreads運用アドバイザーです。

**【最重要】文字数ルール - これを守らないと完全に失敗です**
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- コメント1：**必ず420文字〜480文字**（400文字未満は絶対NG、やり直し）
- コメント2：**必ず420文字〜480文字**（400文字未満は絶対NG、やり直し）
- 300文字台は不合格。必ず420文字以上書いてください。
- 短すぎると価値が薄くなります。具体例や体験談を充実させてください。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**【絶対禁止】絵文字の使用厳禁**

## 工藤さんの文体DNA

### リズム・テンポ設計
- **実績を冒頭2行目に配置**（インパクト最優先）
  - 例：「2ヶ月でフォロワー2500名、167万インプ達成した832件のデータ分析したら...」
- 関西弁要素の配置：「マジで」「やばい」「だるくない？」
- **キャッチーな表現**：「爆伸び」「時代遅れすぎます」
- **コメント間の繋ぎ文言を必ず入れる**：
  - コメント1の最後：「じゃあ具体的にどうすればいいかっていうと▼」

### 体験談挿入（文字数稼ぎにも有効）
- 失敗からの逆転：「僕も最初は○○だったけど」→ 具体的な状況を詳しく書く
- 感情変化：「衝撃受けました」「激変しました」「爆伸びしました」
- 数値を伴う具体例：「1日10投稿に変えた翌週から、フォロワーが毎日30人ペースで増え始めて」

### 共感要素
- 読者の心の声代弁：「○○って感じたことないですか？」
- 軽いツッコミ：「時代遅れすぎです」

### 権威性
- 具体的数値：「1日15投稿」「2ヶ月で2500名増」「167万インプ達成」「832件のデータ分析」
- 数値表記：カンマなし、人→名

## コメントの構成（420文字以上を確保するコツ）

### コメント1の構成（420〜480文字）
1. 導入（フックの補足）：30〜50文字
2. 体験談（具体的なストーリー）：100〜150文字
3. 基本ノウハウ（①②③で3つ）：各60〜80文字×3 = 180〜240文字
4. 繋ぎ文言：「じゃあ具体的にどうすればいいかっていうと▼」

### コメント2の構成（420〜480文字）
1. 応用テクニック：100〜150文字
2. 注意点（①②で2つ）：各50〜70文字×2 = 100〜140文字
3. 行動促進（具体的な次のステップ）：100〜150文字
4. 締め：30〜50文字

## 禁止事項
- 煽り表現：「別次元」「人生変わる」は削除
- 「一緒に○○しましょう」系のCTAは使わない
- フォロー促進のCTAは入れない
- 測定できない指標に具体数値禁止（保存率、滞在時間など）

## 必須事項
- 繋ぎ文言 + ▼記号を付ける
- 「つまり、」「でも、」で論理を明確に
- 箇条書きは「①」「②」「③」を使う
- リスト記号は「・」のみ
- 文末は「です・ます調」

## 出力形式
JSONのみ返してください（markdownブロック不要）:
{
  "comment1": "【420〜480文字】体験談+基本ノウハウ。短いと失敗。",
  "comment2": "【420〜480文字】応用+注意点+行動促進。短いと失敗。"
}`;

// hooks-100.mdからフックを抽出（100個まで）
function extractHooks(): string[] {
  const hooksPath = path.resolve(process.cwd(), "hooks-100.md");
  const content = fs.readFileSync(hooksPath, "utf-8");

  const hooks: string[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    // 数字で始まる行（1. 〜 100.）を抽出
    const match = line.match(/^(\d+)\.\s+(.+)$/);
    if (match) {
      const num = parseInt(match[1]);
      // 1〜100のみ抽出（使い方セクションの番号付き行を除外）
      if (num >= 1 && num <= 100 && hooks.length < 100) {
        hooks.push(match[2].trim());
      }
    }
  }

  return hooks.slice(0, 100); // 念のため100個に制限
}

interface GeneratedPost {
  index: number;
  hook: string;
  comment1: string;
  comment2: string;
  comment1Length: number;
  comment2Length: number;
}

async function generatePost(hook: string, index: number, retryCount = 0): Promise<GeneratedPost> {
  const MAX_RETRIES = 2;
  const userPrompt = `以下のフック（1行目）に続くコメント1・コメント2を生成してください。

【フック（1行目）】
${hook}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【超重要】文字数ルール - 必ず守ってください
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
・コメント1：**必ず420〜480文字**で書いてください
・コメント2：**必ず420〜480文字**で書いてください
・300文字台は不合格です。やり直しになります。
・体験談や具体例を充実させて、必ず420文字以上にしてください。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

【コメント1の構成】420〜480文字
1. 導入（フックの補足）：30〜50文字
2. 体験談（「僕も最初は○○だったけど」から始める具体的なストーリー）：100〜150文字
3. 基本ノウハウ（①②③で3つのポイント）：各60〜80文字×3 = 180〜240文字
4. 繋ぎ文言：「じゃあ具体的にどうすればいいかっていうと▼」

【コメント2の構成】420〜480文字
1. 応用テクニック（具体的な方法を詳しく説明）：100〜150文字
2. 注意点（①②で2つの注意事項）：各50〜70文字×2 = 100〜140文字
3. 行動促進（今日から試せる具体的なステップ）：100〜150文字
4. 締め（短く）：30〜50文字

【禁止事項】
- 絵文字禁止
- フォロー促進のCTA禁止
- 「一緒に○○しましょう」禁止
- 300文字台は禁止（必ず420文字以上）

【形式】
JSONのみ返してください（markdownブロック不要）:
{"comment1": "420〜480文字で書く", "comment2": "420〜480文字で書く"}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2000,
    temperature: 0.9,
    system: THREADS_OPERATION_SYSTEM,
    messages: [
      { role: "user", content: userPrompt }
    ]
  });

  const textContent = response.content[0];
  if (textContent.type !== "text") {
    throw new Error("Unexpected response type");
  }

  // JSONを抽出
  let jsonStr = textContent.text.trim();
  // マークダウンブロックを除去
  jsonStr = jsonStr.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  // JSON文字列内の改行をエスケープ
  jsonStr = jsonStr.replace(/\n(?=(?:[^"]*"[^"]*")*[^"]*$)/g, "");

  // 文字列内の生の改行をエスケープ
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
  jsonStr = escaped;

  let parsed: any;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (parseError) {
    if (retryCount < MAX_RETRIES) {
      console.log(`  [${index}] JSONパースエラー、再試行 (${retryCount + 1}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return generatePost(hook, index, retryCount + 1);
    }
    throw parseError;
  }

  if (!parsed.comment1 || !parsed.comment2) {
    if (retryCount < MAX_RETRIES) {
      console.log(`  [${index}] 空レスポンス、再試行 (${retryCount + 1}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return generatePost(hook, index, retryCount + 1);
    }
    throw new Error("comment1 or comment2 is empty");
  }

  return {
    index,
    hook,
    comment1: parsed.comment1,
    comment2: parsed.comment2,
    comment1Length: parsed.comment1.length,
    comment2Length: parsed.comment2.length,
  };
}

async function main() {
  console.log("=== Threads運用投稿生成開始 ===\n");

  const hooks = extractHooks();
  console.log(`フック数: ${hooks.length}個\n`);

  if (hooks.length === 0) {
    console.error("フックが見つかりません");
    process.exit(1);
  }

  const results: GeneratedPost[] = [];
  const errors: { index: number; hook: string; error: string }[] = [];

  // 5並列で処理
  const batchSize = 5;

  for (let i = 0; i < hooks.length; i += batchSize) {
    const batch = hooks.slice(i, i + batchSize);
    console.log(`処理中: ${i + 1}〜${Math.min(i + batchSize, hooks.length)} / ${hooks.length}`);

    const promises = batch.map((hook, batchIndex) => {
      const globalIndex = i + batchIndex + 1;
      return generatePost(hook, globalIndex)
        .then(result => {
          console.log(`  [${globalIndex}] OK - コメント1: ${result.comment1Length}文字, コメント2: ${result.comment2Length}文字`);
          return result;
        })
        .catch(err => {
          console.error(`  [${globalIndex}] エラー: ${err.message}`);
          errors.push({ index: globalIndex, hook, error: err.message });
          return null;
        });
    });

    const batchResults = await Promise.all(promises);
    for (const result of batchResults) {
      if (result) {
        results.push(result);
      }
    }

    // レート制限対策
    if (i + batchSize < hooks.length) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // 結果を保存
  const outputPath = path.resolve(process.cwd(), "generated-operation-posts.json");
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), "utf-8");

  console.log(`\n=== 完了 ===`);
  console.log(`成功: ${results.length}件`);
  console.log(`エラー: ${errors.length}件`);
  console.log(`保存先: ${outputPath}`);

  // 文字数統計
  if (results.length > 0) {
    const avgComment1 = Math.round(results.reduce((sum, r) => sum + r.comment1Length, 0) / results.length);
    const avgComment2 = Math.round(results.reduce((sum, r) => sum + r.comment2Length, 0) / results.length);
    console.log(`\n平均文字数:`);
    console.log(`  コメント1: ${avgComment1}文字`);
    console.log(`  コメント2: ${avgComment2}文字`);

    // 400文字未満のものをカウント
    const shortComment1 = results.filter(r => r.comment1Length < 400).length;
    const shortComment2 = results.filter(r => r.comment2Length < 400).length;
    if (shortComment1 > 0 || shortComment2 > 0) {
      console.log(`\n400文字未満:`);
      console.log(`  コメント1: ${shortComment1}件`);
      console.log(`  コメント2: ${shortComment2}件`);
    }
  }

  if (errors.length > 0) {
    console.log(`\nエラー一覧:`);
    for (const err of errors) {
      console.log(`  [${err.index}] ${err.hook.substring(0, 30)}...`);
    }
  }
}

main().catch(console.error);
