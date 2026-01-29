import { BigQuery } from '@google-cloud/bigquery';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import puppeteer from 'puppeteer';

// 環境変数読み込み
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.prod') });

const PROJECT_ID = 'mark-454114';
const DATASET = 'autostudio_threads';

interface PostData {
  post_id: string;
  posted_at: string;
  content: string;
  impressions_total: number;
  likes_total: number;
}

interface MonthStats {
  month: string;
  postCount: number;
  totalImpressions: number;
  avgImpressions: number;
}

interface HourStats {
  hour: number;
  postCount: number;
  totalImpressions: number;
  avgImpressions: number;
}

async function main() {
  const bigquery = new BigQuery({ projectId: PROJECT_ID });

  const startDate = '2025-11-14';
  const endDate = '2026-01-12';

  console.log(`期間: ${startDate} 〜 ${endDate}`);
  console.log('データ取得中...');

  // トップ50投稿を取得
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

  const posts: PostData[] = rows.map((row: any) => ({
    post_id: row.post_id,
    posted_at: row.posted_at?.value || row.posted_at,
    content: row.content || '',
    impressions_total: Number(row.impressions_total) || 0,
    likes_total: Number(row.likes_total) || 0,
  }));

  console.log(`取得件数: ${posts.length}件`);

  // 全投稿の月別・時間帯別集計用クエリ
  const allPostsQuery = `
    SELECT
      post_id,
      posted_at,
      COALESCE(impressions_total, 0) as impressions_total
    FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
    WHERE post_id IS NOT NULL
      AND post_id != ''
      AND DATE(posted_at) >= @startDate
      AND DATE(posted_at) <= @endDate
  `;

  const [allRows] = await bigquery.query({
    query: allPostsQuery,
    params: { startDate, endDate },
  });

  const allPosts = allRows.map((row: any) => ({
    posted_at: row.posted_at?.value || row.posted_at,
    impressions_total: Number(row.impressions_total) || 0,
  }));

  // 月別集計
  const monthMap = new Map<string, { count: number; impressions: number }>();
  for (const post of allPosts) {
    const date = new Date(post.posted_at);
    const month = `${date.getFullYear()}年${date.getMonth() + 1}月`;
    const existing = monthMap.get(month) || { count: 0, impressions: 0 };
    existing.count++;
    existing.impressions += post.impressions_total;
    monthMap.set(month, existing);
  }

  const monthStats: MonthStats[] = Array.from(monthMap.entries())
    .map(([month, data]) => ({
      month,
      postCount: data.count,
      totalImpressions: data.impressions,
      avgImpressions: Math.round(data.impressions / data.count),
    }))
    .sort((a, b) => b.avgImpressions - a.avgImpressions);

  // 時間帯別集計（日本時間）
  const hourMap = new Map<number, { count: number; impressions: number }>();
  for (const post of allPosts) {
    const date = new Date(post.posted_at);
    // UTC→日本時間に変換
    const jstHour = (date.getUTCHours() + 9) % 24;
    const existing = hourMap.get(jstHour) || { count: 0, impressions: 0 };
    existing.count++;
    existing.impressions += post.impressions_total;
    hourMap.set(jstHour, existing);
  }

  const hourStats: HourStats[] = Array.from(hourMap.entries())
    .map(([hour, data]) => ({
      hour,
      postCount: data.count,
      totalImpressions: data.impressions,
      avgImpressions: Math.round(data.impressions / data.count),
    }))
    .sort((a, b) => b.avgImpressions - a.avgImpressions);

  // サマリー計算
  const totalPosts = allPosts.length;
  const totalImpressions = allPosts.reduce((sum, p) => sum + p.impressions_total, 0);
  const avgImpressions = totalPosts > 0 ? Math.round(totalImpressions / totalPosts) : 0;

  // HTML生成
  const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Threadsインプレッション分析レポート</title>
  <style>
    body {
      font-family: "Hiragino Kaku Gothic ProN", "Hiragino Sans", "Yu Gothic", sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #333;
      font-size: 12px;
      line-height: 1.6;
    }
    h1 {
      text-align: center;
      font-size: 24px;
      margin-bottom: 10px;
    }
    .subtitle {
      text-align: center;
      color: #666;
      margin-bottom: 30px;
    }
    h2 {
      font-size: 16px;
      border-bottom: 2px solid #333;
      padding-bottom: 5px;
      margin-top: 30px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 15px 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    th {
      background: #f5f5f5;
      font-weight: bold;
    }
    tr:nth-child(even) {
      background: #fafafa;
    }
    .highlight {
      background: #fff3cd;
    }
    .number {
      text-align: right;
    }
    .summary-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin: 20px 0;
    }
    .summary-card {
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      padding: 15px;
      text-align: center;
    }
    .summary-card .label {
      font-size: 11px;
      color: #666;
    }
    .summary-card .value {
      font-size: 24px;
      font-weight: bold;
      color: #333;
    }
    .content-preview {
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .page-break {
      page-break-before: always;
    }
  </style>
</head>
<body>
  <h1>Threadsインプレッション分析レポート</h1>
  <p class="subtitle">対象期間: ${startDate} 〜 ${endDate}<br>生成日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>

  <h2>サマリー</h2>
  <div class="summary-grid">
    <div class="summary-card">
      <div class="label">総投稿数</div>
      <div class="value">${totalPosts.toLocaleString()}</div>
    </div>
    <div class="summary-card">
      <div class="label">総インプレッション</div>
      <div class="value">${totalImpressions.toLocaleString()}</div>
    </div>
    <div class="summary-card">
      <div class="label">平均インプレッション</div>
      <div class="value">${avgImpressions.toLocaleString()}</div>
    </div>
  </div>

  <h2>月別インプレッション分析</h2>
  <p>（平均インプレッション順）</p>
  <table>
    <thead>
      <tr>
        <th>月</th>
        <th class="number">投稿数</th>
        <th class="number">平均imp</th>
        <th class="number">合計imp</th>
      </tr>
    </thead>
    <tbody>
      ${monthStats.map((s, i) => `
        <tr${i === 0 ? ' class="highlight"' : ''}>
          <td>${s.month}</td>
          <td class="number">${s.postCount}件</td>
          <td class="number">${s.avgImpressions.toLocaleString()}</td>
          <td class="number">${s.totalImpressions.toLocaleString()}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>時間帯別インプレッション分析（日本時間）</h2>
  <p>（平均インプレッション順）</p>
  <table>
    <thead>
      <tr>
        <th>時間帯</th>
        <th class="number">投稿数</th>
        <th class="number">平均imp</th>
      </tr>
    </thead>
    <tbody>
      ${hourStats.map((s, i) => `
        <tr${i < 3 ? ' class="highlight"' : ''}>
          <td>${s.hour}時台</td>
          <td class="number">${s.postCount}件</td>
          <td class="number">${s.avgImpressions.toLocaleString()}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="page-break"></div>

  <h2>インプレッションTOP50投稿</h2>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th class="number">imp</th>
        <th class="number">いいね</th>
        <th>投稿日時</th>
        <th>内容（抜粋）</th>
      </tr>
    </thead>
    <tbody>
      ${posts.map((p, i) => {
        const date = new Date(p.posted_at);
        const jstDate = date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
        const preview = p.content.replace(/\n/g, ' ').slice(0, 60) + (p.content.length > 60 ? '...' : '');
        return `
          <tr${i < 3 ? ' class="highlight"' : ''}>
            <td>${i + 1}</td>
            <td class="number">${p.impressions_total.toLocaleString()}</td>
            <td class="number">${p.likes_total}</td>
            <td>${jstDate}</td>
            <td class="content-preview">${preview}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>
</body>
</html>
`;

  // PDF生成
  const outputDir = path.join(process.env.HOME || '/tmp', 'Downloads');
  const pdfPath = path.join(outputDir, 'threads-impression-analysis.pdf');
  const htmlPath = path.join(outputDir, 'threads-impression-analysis.html');

  // HTMLも保存
  fs.writeFileSync(htmlPath, html);
  console.log(`HTMLレポートを生成しました: ${htmlPath}`);

  // Puppeteerで PDF生成
  console.log('PDF生成中...');
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    printBackground: true,
  });
  await browser.close();

  console.log(`PDFレポートを生成しました: ${pdfPath}`);

  // マークダウンレポートも生成
  const mdPath = path.join(outputDir, 'threads-impression-analysis.md');
  let md = `# Threadsインプレッション分析レポート

**対象期間**: ${startDate} 〜 ${endDate}
**生成日時**: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}

---

## サマリー

| 項目 | 値 |
|------|-----|
| 総投稿数 | ${totalPosts.toLocaleString()}件 |
| 総インプレッション | ${totalImpressions.toLocaleString()} |
| 平均インプレッション | ${avgImpressions.toLocaleString()} |

---

## 月別インプレッション分析

（平均インプレッション順）

| 月 | 投稿数 | 平均imp | 合計imp |
|----|--------|---------|---------|
${monthStats.map(s => `| ${s.month} | ${s.postCount}件 | ${s.avgImpressions.toLocaleString()} | ${s.totalImpressions.toLocaleString()} |`).join('\n')}

---

## 時間帯別インプレッション分析（日本時間）

（平均インプレッション順）

| 時間帯 | 投稿数 | 平均imp |
|--------|--------|---------|
${hourStats.map(s => `| ${s.hour}時台 | ${s.postCount}件 | ${s.avgImpressions.toLocaleString()} |`).join('\n')}

---

## インプレッションTOP50投稿

| 順位 | インプレッション | いいね | 投稿日時 | 内容（抜粋） |
|------|------------------|--------|----------|--------------|
${posts.map((p, i) => {
  const date = new Date(p.posted_at);
  const jstDate = date.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const preview = p.content.replace(/\n/g, ' ').replace(/\|/g, '｜').slice(0, 50) + (p.content.length > 50 ? '...' : '');
  return `| ${i + 1} | ${p.impressions_total.toLocaleString()} | ${p.likes_total} | ${jstDate} | ${preview} |`;
}).join('\n')}
`;

  fs.writeFileSync(mdPath, md);
  console.log(`マークダウンレポートも生成しました: ${mdPath}`);
}

main().catch(console.error);
