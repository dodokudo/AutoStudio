/**
 * コメント欄遷移分析レポート
 * 期間: 2025-11-28 〜 2026-01-10
 * TOP30: 遷移率、コメント欄2閲覧数
 */

import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env.prod') });

const PROJECT_ID = 'mark-454114';
const START_DATE = '2025-11-28';
const END_DATE = '2026-01-10';

async function getBigQueryClient(): Promise<BigQuery> {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');

  const jsonString = rawJson.startsWith('{') ? rawJson : Buffer.from(rawJson, 'base64').toString('utf8');
  const credentials = JSON.parse(jsonString);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  return new BigQuery({
    projectId: PROJECT_ID,
    credentials,
    location: 'US',
  });
}

interface CommentWithOrder {
  comment_id: string;
  parent_post_id: string;
  timestamp: string;
  views: number;
  text: string;
  comment_order: number;
}

interface PostWithComments {
  post_id: string;
  posted_at: string;
  content: string;
  impressions: number;
  comments: CommentWithOrder[];
}

interface TransitionData {
  post: PostWithComments;
  comment1Views: number;
  comment2Views: number;
  transitionRate: number;
}

async function analyze() {
  const bigquery = await getBigQueryClient();

  console.log('投稿データを取得中...');
  const [postRows] = await bigquery.query({
    query: `
      SELECT
        post_id,
        CAST(posted_at AS STRING) as posted_at,
        content,
        impressions_total as impressions
      FROM \`${PROJECT_ID}.autostudio_threads.threads_posts\`
      WHERE DATE(posted_at) BETWEEN '${START_DATE}' AND '${END_DATE}'
    `
  });

  const posts = new Map<string, PostWithComments>();
  for (const r of postRows as Array<{ post_id: string; posted_at: string; content: string; impressions: number }>) {
    posts.set(r.post_id, {
      post_id: r.post_id,
      posted_at: r.posted_at,
      content: r.content || '',
      impressions: Number(r.impressions),
      comments: []
    });
  }
  console.log(`投稿数: ${posts.size}`);

  console.log('コメントデータを取得中...');
  const [commentRows] = await bigquery.query({
    query: `
      SELECT
        comment_id,
        parent_post_id,
        CAST(timestamp AS STRING) as timestamp,
        views,
        text
      FROM \`${PROJECT_ID}.autostudio_threads.threads_comments\`
      WHERE DATE(timestamp) BETWEEN '${START_DATE}' AND '${END_DATE}'
      ORDER BY parent_post_id, timestamp ASC
    `
  });

  const commentsByPost = new Map<string, CommentWithOrder[]>();
  for (const r of commentRows as Array<{ comment_id: string; parent_post_id: string; timestamp: string; views: number; text: string }>) {
    if (!commentsByPost.has(r.parent_post_id)) {
      commentsByPost.set(r.parent_post_id, []);
    }
    const arr = commentsByPost.get(r.parent_post_id)!;
    arr.push({
      comment_id: r.comment_id,
      parent_post_id: r.parent_post_id,
      timestamp: r.timestamp,
      views: Number(r.views),
      text: r.text || '',
      comment_order: arr.length + 1
    });
  }

  for (const [postId, comments] of commentsByPost) {
    if (posts.has(postId)) {
      posts.get(postId)!.comments = comments;
    }
  }

  console.log(`コメント付き投稿数: ${commentsByPost.size}`);

  // コメント欄2があるポストを抽出
  const postsWithComment2: PostWithComments[] = [];
  for (const post of posts.values()) {
    if (post.comments.length >= 2) {
      postsWithComment2.push(post);
    }
  }

  console.log(`コメント欄2がある投稿数: ${postsWithComment2.length}`);

  // 遷移データを計算
  const transitionData: TransitionData[] = postsWithComment2.map(post => {
    const comment1 = post.comments.find(c => c.comment_order === 1);
    const comment2 = post.comments.find(c => c.comment_order === 2);
    return {
      post,
      comment1Views: comment1?.views || 0,
      comment2Views: comment2?.views || 0,
      transitionRate: post.impressions > 0 ? ((comment2?.views || 0) / post.impressions) * 100 : 0
    };
  });

  // レポート生成
  let report = `# コメント欄遷移分析レポート

**分析期間:** ${START_DATE} 〜 ${END_DATE}
**レポート生成日:** ${new Date().toISOString().split('T')[0]}

---

## 1. 全体サマリー

| 指標 | 数値 |
|------|------|
| 対象投稿数（コメント欄2あり） | ${postsWithComment2.length}件 |
| 合計インプレッション | ${transitionData.reduce((s, d) => s + d.post.impressions, 0).toLocaleString()} |
| 合計コメント欄1閲覧 | ${transitionData.reduce((s, d) => s + d.comment1Views, 0).toLocaleString()} |
| 合計コメント欄2閲覧 | ${transitionData.reduce((s, d) => s + d.comment2Views, 0).toLocaleString()} |

---

## 2. 遷移率TOP30（コメント欄2閲覧数 ÷ メイン投稿インプレッション）

`;

  const byRate = [...transitionData]
    .filter(d => d.comment2Views > 0)
    .sort((a, b) => b.transitionRate - a.transitionRate);

  report += `| 順位 | 投稿日時 | インプ | コメ1閲覧 | コメ2閲覧 | 遷移率% | 内容 |
|------|----------|--------|-----------|-----------|---------|------|
`;

  byRate.slice(0, 30).forEach((d, i) => {
    const content = d.post.content.replace(/\n/g, ' ').replace(/\|/g, '｜').substring(0, 40);
    const datetime = d.post.posted_at.substring(0, 16).replace('T', ' ');
    report += `| ${i + 1} | ${datetime} | ${d.post.impressions.toLocaleString()} | ${d.comment1Views.toLocaleString()} | ${d.comment2Views.toLocaleString()} | ${d.transitionRate.toFixed(2)} | ${content}... |\n`;
  });

  report += `
---

## 3. コメント欄2閲覧数TOP30（絶対数）

`;

  const byCount = [...transitionData]
    .filter(d => d.comment2Views > 0)
    .sort((a, b) => b.comment2Views - a.comment2Views);

  report += `| 順位 | 投稿日時 | インプ | コメ1閲覧 | コメ2閲覧 | 遷移率% | 内容 |
|------|----------|--------|-----------|-----------|---------|------|
`;

  byCount.slice(0, 30).forEach((d, i) => {
    const content = d.post.content.replace(/\n/g, ' ').replace(/\|/g, '｜').substring(0, 40);
    const datetime = d.post.posted_at.substring(0, 16).replace('T', ' ');
    report += `| ${i + 1} | ${datetime} | ${d.post.impressions.toLocaleString()} | ${d.comment1Views.toLocaleString()} | ${d.comment2Views.toLocaleString()} | ${d.transitionRate.toFixed(2)} | ${content}... |\n`;
  });

  // 両方TOP30に入っている投稿
  const topRateIds = new Set(byRate.slice(0, 30).map(d => d.post.post_id));
  const topCountIds = new Set(byCount.slice(0, 30).map(d => d.post.post_id));
  const bothTop = byRate.filter(d => topRateIds.has(d.post.post_id) && topCountIds.has(d.post.post_id));

  report += `
---

## 4. 遷移率・閲覧数 両方TOP30に入っている投稿（${bothTop.length}件）

`;

  if (bothTop.length > 0) {
    report += `| 順位 | 投稿日時 | インプ | コメ1閲覧 | コメ2閲覧 | 遷移率% | 内容 |
|------|----------|--------|-----------|-----------|---------|------|
`;
    bothTop.forEach((d, i) => {
      const content = d.post.content.replace(/\n/g, ' ').replace(/\|/g, '｜').substring(0, 40);
      const datetime = d.post.posted_at.substring(0, 16).replace('T', ' ');
      report += `| ${i + 1} | ${datetime} | ${d.post.impressions.toLocaleString()} | ${d.comment1Views.toLocaleString()} | ${d.comment2Views.toLocaleString()} | ${d.transitionRate.toFixed(2)} | ${content}... |\n`;
    });
  }

  report += `
---

## 5. 投稿詳細（遷移率TOP10）

`;

  byRate.slice(0, 10).forEach((d, i) => {
    const datetime = d.post.posted_at.substring(0, 19).replace('T', ' ');
    report += `### ${i + 1}位: ${datetime}

**インプレッション:** ${d.post.impressions.toLocaleString()}
**コメント欄1閲覧:** ${d.comment1Views.toLocaleString()}
**コメント欄2閲覧:** ${d.comment2Views.toLocaleString()}
**遷移率:** ${d.transitionRate.toFixed(2)}%

**メイン投稿内容:**
\`\`\`
${d.post.content.substring(0, 300)}
\`\`\`

**コメント構成:**
`;
    d.post.comments.slice(0, 4).forEach(c => {
      const cTime = c.timestamp.substring(11, 16);
      report += `- コメント${c.comment_order} [${cTime}] views:${c.views} - ${c.text.replace(/\n/g, ' ').substring(0, 50)}...\n`;
    });
    report += '\n---\n\n';
  });

  report += `
## 6. 投稿詳細（閲覧数TOP10）

`;

  byCount.slice(0, 10).forEach((d, i) => {
    const datetime = d.post.posted_at.substring(0, 19).replace('T', ' ');
    report += `### ${i + 1}位: ${datetime}

**インプレッション:** ${d.post.impressions.toLocaleString()}
**コメント欄1閲覧:** ${d.comment1Views.toLocaleString()}
**コメント欄2閲覧:** ${d.comment2Views.toLocaleString()}
**遷移率:** ${d.transitionRate.toFixed(2)}%

**メイン投稿内容:**
\`\`\`
${d.post.content.substring(0, 300)}
\`\`\`

**コメント構成:**
`;
    d.post.comments.slice(0, 4).forEach(c => {
      const cTime = c.timestamp.substring(11, 16);
      report += `- コメント${c.comment_order} [${cTime}] views:${c.views} - ${c.text.replace(/\n/g, ' ').substring(0, 50)}...\n`;
    });
    report += '\n---\n\n';
  });

  report += `\n*レポート生成日: ${new Date().toISOString().split('T')[0]}*\n`;

  // ファイル保存
  const outputPath = '/Users/kudo/Downloads/コメント欄遷移分析_TOP30_2025-11-28_to_2026-01-10.md';
  fs.writeFileSync(outputPath, report);
  console.log(`\nレポート保存: ${outputPath}`);

  // コンソールにもサマリー出力
  console.log('\n=== サマリー ===');
  console.log(`対象投稿数: ${postsWithComment2.length}件`);
  console.log(`遷移率TOP1: ${byRate[0]?.transitionRate.toFixed(2)}%`);
  console.log(`閲覧数TOP1: ${byCount[0]?.comment2Views.toLocaleString()}views`);
}

analyze().catch(console.error);
