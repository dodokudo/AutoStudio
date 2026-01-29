import { BigQuery } from '@google-cloud/bigquery';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';

// 環境変数読み込み
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.prod') });

const PROJECT_ID = 'mark-454114';
const DATASET = 'autostudio_threads';

interface PostWithComments {
  post_id: string;
  posted_at: string;
  content: string;
  impressions_total: number;
  likes_total: number;
  comments: { depth: number; text: string }[];
}

async function main() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  const startDate = '2025-11-14';
  const endDate = '2026-01-12';

  console.log('TOP50投稿を取得中...');

  // TOP50投稿を取得
  const query = `
    SELECT
      post_id,
      posted_at,
      content,
      COALESCE(impressions_total, 0) as impressions_total,
      COALESCE(likes_total, 0) as likes_total
    FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
    WHERE post_id IS NOT NULL
      AND post_id != ''
      AND DATE(posted_at) >= @startDate
      AND DATE(posted_at) <= @endDate
    ORDER BY impressions_total DESC
    LIMIT 50
  `;

  const [rows] = await bigquery.query({
    query,
    params: { startDate, endDate },
  });

  const postIds = rows.map((row: any) => row.post_id);

  // コメントを取得
  const [commentRows] = await bigquery.query({
    query: `
      SELECT
        parent_post_id,
        depth,
        text
      FROM \`${PROJECT_ID}.${DATASET}.threads_comments\`
      WHERE parent_post_id IN UNNEST(@postIds)
      ORDER BY parent_post_id, timestamp ASC
    `,
    params: { postIds },
  });

  // コメントをグループ化
  const commentsByPostId = new Map<string, { depth: number; text: string }[]>();
  for (const row of commentRows as any[]) {
    const postId = row.parent_post_id;
    if (!commentsByPostId.has(postId)) {
      commentsByPostId.set(postId, []);
    }
    commentsByPostId.get(postId)!.push({
      depth: Number(row.depth) || 0,
      text: row.text || '',
    });
  }

  // 投稿とコメントを結合
  const posts: PostWithComments[] = rows.map((row: any) => ({
    post_id: row.post_id,
    posted_at: row.posted_at?.value || row.posted_at,
    content: row.content || '',
    impressions_total: Number(row.impressions_total) || 0,
    likes_total: Number(row.likes_total) || 0,
    comments: commentsByPostId.get(row.post_id) || [],
  }));

  console.log(`取得完了: ${posts.length}件`);

  // 分析用データを整形
  const analysisData = posts.slice(0, 30).map((post, i) => {
    const comment1 = post.comments.find(c => c.depth === 1);
    const comment2 = post.comments.find(c => c.depth === 2);

    return `
=== 投稿${i + 1} (${post.impressions_total.toLocaleString()}imp) ===
【メイン投稿】
${post.content}

【コメント欄1】
${comment1?.text || '(なし)'}

【コメント欄2】
${comment2?.text || '(なし)'}
`;
  }).join('\n\n');

  console.log('Claude APIでテンプレート生成中...');

  const anthropic = new Anthropic({
    apiKey: process.env.CLAUDE_API_KEY,
  });

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [
      {
        role: 'user',
        content: `以下はThreadsで高インプレッションを獲得した投稿TOP30です。これらを分析して、「伸びる長文投稿テンプレート」を10個作成してください。

【要件】
1. 各テンプレートは「メイン投稿」「コメント欄1」「コメント欄2」の3部構成
2. 穴埋め形式（{◯◯}のように変数を設定）で、誰でも使えるようにする
3. 長文投稿用（各パート300-500文字程度を想定）
4. 伸びている投稿の共通パターン（フック、構成、CTAなど）を反映
5. テンプレート名と、どんな場面で使うかの説明も付ける

【出力形式】
各テンプレートは以下の形式で出力してください：

---
## テンプレート1: 〇〇型
**使用場面**: 〇〇

### メイン投稿
（テンプレート本文）

### コメント欄1
（テンプレート本文）

### コメント欄2
（テンプレート本文）

---

【分析対象の投稿データ】
${analysisData}
`,
      },
    ],
  });

  const templateContent = response.content[0].type === 'text' ? response.content[0].text : '';

  // ファイル保存
  const outputDir = path.join(process.env.HOME || '/tmp', 'Downloads');
  const mdPath = path.join(outputDir, 'threads-templates.md');

  const finalContent = `# Threads長文投稿テンプレート集

**生成日時**: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
**分析対象**: 2025/11/14〜2026/1/12のTOP30投稿

---

${templateContent}
`;

  fs.writeFileSync(mdPath, finalContent);
  console.log(`テンプレートを保存しました: ${mdPath}`);

  // PDFも生成
  const puppeteer = await import('puppeteer');

  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Threads長文投稿テンプレート集</title>
  <style>
    body {
      font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #333;
      font-size: 13px;
      line-height: 1.8;
    }
    h1 {
      text-align: center;
      font-size: 22px;
      border-bottom: 3px solid #333;
      padding-bottom: 15px;
    }
    h2 {
      font-size: 16px;
      background: #f5f5f5;
      padding: 10px 15px;
      margin-top: 40px;
      border-left: 4px solid #333;
    }
    h3 {
      font-size: 14px;
      color: #555;
      margin-top: 20px;
    }
    p {
      margin: 10px 0;
    }
    pre {
      background: #fafafa;
      border: 1px solid #ddd;
      padding: 15px;
      border-radius: 5px;
      white-space: pre-wrap;
      font-size: 12px;
    }
    code {
      background: #fff3cd;
      padding: 2px 5px;
      border-radius: 3px;
    }
    hr {
      border: none;
      border-top: 1px dashed #ccc;
      margin: 30px 0;
    }
    .subtitle {
      text-align: center;
      color: #666;
      margin-bottom: 30px;
    }
    strong {
      color: #d63384;
    }
  </style>
</head>
<body>
  <h1>Threads長文投稿テンプレート集</h1>
  <p class="subtitle">生成日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}<br>分析対象: 2025/11/14〜2026/1/12のTOP30投稿</p>
  ${templateContent
    .replace(/^## /gm, '<h2>')
    .replace(/^### /gm, '<h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\{([^}]+)\}/g, '<code>{$1}</code>')
    .replace(/---/g, '<hr>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/<h2>/g, '</p><h2>')
    .replace(/<h3>/g, '</p><h3>')
    .replace(/<\/h2>/g, '</h2><p>')
    .replace(/<\/h3>/g, '</h3><p>')
  }
</body>
</html>
`;

  const pdfPath = path.join(outputDir, 'threads-templates.pdf');
  const browser = await puppeteer.default.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    printBackground: true,
  });
  await browser.close();

  console.log(`PDFを保存しました: ${pdfPath}`);
}

main().catch(console.error);
