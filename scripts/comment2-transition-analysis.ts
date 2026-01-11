/**
 * メイン投稿 → コメント欄2 の遷移分析
 * depth=1（コメント欄2）の閲覧数を分析
 */

import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.prod') });

const PROJECT_ID = 'mark-454114';

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

async function analyze() {
  const bigquery = await getBigQueryClient();

  // メイン投稿とコメント欄1、コメント欄2の閲覧数を取得
  const [rows] = await bigquery.query({
    query: `
      WITH post_data AS (
        SELECT
          post_id,
          CAST(posted_at AS STRING) as posted_at,
          content,
          impressions_total as impressions
        FROM \`${PROJECT_ID}.autostudio_threads.threads_posts\`
        WHERE DATE(posted_at) BETWEEN '2025-11-28' AND '2025-12-11'
      ),
      comment1_data AS (
        SELECT
          parent_post_id,
          SUM(views) as comment1_views
        FROM \`${PROJECT_ID}.autostudio_threads.threads_comments\`
        WHERE depth = 0
          AND DATE(timestamp) BETWEEN '2025-11-28' AND '2025-12-11'
        GROUP BY parent_post_id
      ),
      comment2_data AS (
        SELECT
          parent_post_id,
          SUM(views) as comment2_views
        FROM \`${PROJECT_ID}.autostudio_threads.threads_comments\`
        WHERE depth = 1
          AND DATE(timestamp) BETWEEN '2025-11-28' AND '2025-12-11'
        GROUP BY parent_post_id
      )
      SELECT
        p.post_id,
        p.posted_at,
        p.content,
        p.impressions,
        COALESCE(c1.comment1_views, 0) as comment1_views,
        COALESCE(c2.comment2_views, 0) as comment2_views,
        CASE WHEN p.impressions > 0
          THEN COALESCE(c2.comment2_views, 0) / p.impressions * 100
          ELSE 0
        END as transition_rate
      FROM post_data p
      LEFT JOIN comment1_data c1 ON p.post_id = c1.parent_post_id
      LEFT JOIN comment2_data c2 ON p.post_id = c2.parent_post_id
      WHERE COALESCE(c2.comment2_views, 0) > 0
      ORDER BY transition_rate DESC
    `
  });

  console.log('='.repeat(100));
  console.log('メイン投稿 → コメント欄2 遷移分析');
  console.log('期間: 2025-11-28 〜 2025-12-11');
  console.log('='.repeat(100));

  // 遷移率TOP20
  console.log('\n');
  console.log('='.repeat(100));
  console.log('【1】遷移率TOP20（コメント欄2閲覧数 ÷ メイン投稿インプレッション）');
  console.log('='.repeat(100));
  console.log('順位  投稿日時              インプ    コメ1    コメ2    遷移率%  内容');
  console.log('-'.repeat(100));

  const byRate = [...(rows as Array<{
    post_id: string;
    posted_at: string;
    content: string;
    impressions: number;
    comment1_views: number;
    comment2_views: number;
    transition_rate: number;
  }>)].sort((a, b) => Number(b.transition_rate) - Number(a.transition_rate));

  byRate.slice(0, 20).forEach((r, i) => {
    const content = String(r.content || '').replace(/\n/g, ' ').substring(0, 50);
    console.log(
      String(i + 1).padStart(2) + '    ' +
      r.posted_at.substring(0, 16).padEnd(18) +
      String(Number(r.impressions).toLocaleString()).padStart(8) +
      String(Number(r.comment1_views).toLocaleString()).padStart(9) +
      String(Number(r.comment2_views).toLocaleString()).padStart(9) +
      Number(r.transition_rate).toFixed(2).padStart(10) +
      '  ' + content + '...'
    );
  });

  // 遷移数TOP20
  console.log('\n');
  console.log('='.repeat(100));
  console.log('【2】遷移数TOP20（コメント欄2閲覧数の絶対数）');
  console.log('='.repeat(100));
  console.log('順位  投稿日時              インプ    コメ1    コメ2    遷移率%  内容');
  console.log('-'.repeat(100));

  const byCount = [...(rows as Array<{
    post_id: string;
    posted_at: string;
    content: string;
    impressions: number;
    comment1_views: number;
    comment2_views: number;
    transition_rate: number;
  }>)].sort((a, b) => Number(b.comment2_views) - Number(a.comment2_views));

  byCount.slice(0, 20).forEach((r, i) => {
    const content = String(r.content || '').replace(/\n/g, ' ').substring(0, 50);
    console.log(
      String(i + 1).padStart(2) + '    ' +
      r.posted_at.substring(0, 16).padEnd(18) +
      String(Number(r.impressions).toLocaleString()).padStart(8) +
      String(Number(r.comment1_views).toLocaleString()).padStart(9) +
      String(Number(r.comment2_views).toLocaleString()).padStart(9) +
      Number(r.transition_rate).toFixed(2).padStart(10) +
      '  ' + content + '...'
    );
  });

  // 両方TOP20に入っている投稿
  const topRateIds = new Set(byRate.slice(0, 20).map(r => r.post_id));
  const topCountIds = new Set(byCount.slice(0, 20).map(r => r.post_id));
  const bothTop = byRate.filter(r => topRateIds.has(r.post_id) && topCountIds.has(r.post_id));

  console.log('\n');
  console.log('='.repeat(100));
  console.log('【3】遷移率・遷移数 両方TOP20に入っている投稿（' + bothTop.length + '件）');
  console.log('='.repeat(100));

  if (bothTop.length > 0) {
    console.log('順位  投稿日時              インプ    コメ1    コメ2    遷移率%  内容');
    console.log('-'.repeat(100));
    bothTop.forEach((r, i) => {
      const content = String(r.content || '').replace(/\n/g, ' ').substring(0, 50);
      console.log(
        String(i + 1).padStart(2) + '    ' +
        r.posted_at.substring(0, 16).padEnd(18) +
        String(Number(r.impressions).toLocaleString()).padStart(8) +
        String(Number(r.comment1_views).toLocaleString()).padStart(9) +
        String(Number(r.comment2_views).toLocaleString()).padStart(9) +
        Number(r.transition_rate).toFixed(2).padStart(10) +
        '  ' + content + '...'
      );
    });
  }

  // サマリー統計
  const allData = rows as Array<{
    impressions: number;
    comment1_views: number;
    comment2_views: number;
  }>;

  const totalImpressions = allData.reduce((s, r) => s + Number(r.impressions), 0);
  const totalComment1 = allData.reduce((s, r) => s + Number(r.comment1_views), 0);
  const totalComment2 = allData.reduce((s, r) => s + Number(r.comment2_views), 0);

  console.log('\n');
  console.log('='.repeat(100));
  console.log('【4】全体サマリー');
  console.log('='.repeat(100));
  console.log('コメント欄2があるポスト数: ' + allData.length + '件');
  console.log('');
  console.log('合計インプレッション: ' + totalImpressions.toLocaleString());
  console.log('合計コメント欄1閲覧: ' + totalComment1.toLocaleString() + ' (' + (totalComment1 / totalImpressions * 100).toFixed(2) + '%)');
  console.log('合計コメント欄2閲覧: ' + totalComment2.toLocaleString() + ' (' + (totalComment2 / totalImpressions * 100).toFixed(2) + '%)');
  console.log('');
  console.log('コメント1→コメント2 遷移率: ' + (totalComment2 / totalComment1 * 100).toFixed(2) + '%');
}

analyze().catch(console.error);
