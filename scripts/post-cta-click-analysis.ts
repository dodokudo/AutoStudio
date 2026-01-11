/**
 * メイン投稿別のCTA→クリック遷移率分析
 * どの投稿がクリックに繋がりやすいかを分析
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

interface PostData {
  postedAt: string;
  content: string;
  impressions: number;
  ctaViews: number;
}

interface DailyData {
  date: string;
  ctaViews: number;
  clicks: number;
  clickRate: number;
  posts: PostData[];
}

async function analyze() {
  const bigquery = await getBigQueryClient();

  // 投稿別のCTA閲覧数と日付を取得
  const [postRows] = await bigquery.query({
    query: `
      SELECT
        p.post_id,
        DATE(p.posted_at) as post_date,
        CAST(p.posted_at AS STRING) as posted_at,
        p.content,
        p.impressions_total as impressions,
        SUM(c.views) as cta_views
      FROM \`${PROJECT_ID}.autostudio_threads.threads_posts\` p
      INNER JOIN \`${PROJECT_ID}.autostudio_threads.threads_comments\` c
        ON p.post_id = c.parent_post_id
      WHERE DATE(p.posted_at) BETWEEN '2025-11-29' AND '2025-12-11'
        AND LOWER(c.text) LIKE '%autostudio-self.vercel.app%'
      GROUP BY p.post_id, p.posted_at, p.content, p.impressions_total
      HAVING SUM(c.views) > 0
      ORDER BY DATE(p.posted_at), SUM(c.views) DESC
    `
  });

  // 日別クリック数を取得
  const [clickRows] = await bigquery.query({
    query: `
      WITH latest_links AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at DESC) as rn
        FROM \`${PROJECT_ID}.autostudio_links.short_links\`
        WHERE is_active = true AND category = 'threads'
      )
      SELECT
        DATE(TIMESTAMP(cl.clicked_at), 'Asia/Tokyo') as date,
        COUNT(*) as clicks
      FROM \`${PROJECT_ID}.autostudio_links.click_logs\` cl
      INNER JOIN latest_links ll ON cl.short_link_id = ll.id
      WHERE ll.rn = 1
        AND DATE(TIMESTAMP(cl.clicked_at), 'Asia/Tokyo') BETWEEN '2025-11-29' AND '2025-12-11'
      GROUP BY DATE(TIMESTAMP(cl.clicked_at), 'Asia/Tokyo')
    `
  });

  // 日別CTA合計を計算
  const dailyCtaMap = new Map<string, number>();
  const dailyPostsMap = new Map<string, PostData[]>();

  for (const r of postRows as Array<{ post_date: { value: string }; posted_at: string; content: string; impressions: number; cta_views: number }>) {
    const date = r.post_date.value;
    dailyCtaMap.set(date, (dailyCtaMap.get(date) || 0) + Number(r.cta_views));
    if (!dailyPostsMap.has(date)) dailyPostsMap.set(date, []);
    dailyPostsMap.get(date)!.push({
      postedAt: r.posted_at,
      content: String(r.content || ''),
      impressions: Number(r.impressions),
      ctaViews: Number(r.cta_views)
    });
  }

  // 日別クリック数をマップに
  const clickMap = new Map<string, number>();
  for (const r of clickRows as Array<{ date: { value: string }; clicks: number }>) {
    clickMap.set(r.date.value, Number(r.clicks));
  }

  // 日別データを作成
  const dailyData: DailyData[] = [];
  for (const [date, ctaViews] of dailyCtaMap) {
    const clicks = clickMap.get(date) || 0;
    const clickRate = ctaViews > 0 ? (clicks / ctaViews) * 100 : 0;
    dailyData.push({ date, ctaViews, clicks, clickRate, posts: dailyPostsMap.get(date) || [] });
  }
  dailyData.sort((a, b) => a.date.localeCompare(b.date));

  // 日別クリック率
  console.log('='.repeat(70));
  console.log('【日別】CTA閲覧 → クリック遷移率');
  console.log('='.repeat(70));
  console.log('日付          CTA閲覧   クリック   クリック率%');
  console.log('-'.repeat(50));

  for (const d of dailyData) {
    console.log(
      d.date.padEnd(14) +
      String(d.ctaViews).padStart(8) +
      String(d.clicks).padStart(10) +
      d.clickRate.toFixed(1).padStart(12)
    );
  }

  // クリック率でソート
  const sortedByRate = [...dailyData].sort((a, b) => b.clickRate - a.clickRate);

  console.log('\n');
  console.log('='.repeat(90));
  console.log('【クリック率TOP3の日】どんなメイン投稿があったか');
  console.log('='.repeat(90));

  for (const day of sortedByRate.slice(0, 3)) {
    console.log('\n■ ' + day.date + '（CTA閲覧: ' + day.ctaViews + ' → クリック: ' + day.clicks + ' = ' + day.clickRate.toFixed(1) + '%）');
    console.log('-'.repeat(85));
    for (const p of day.posts.slice(0, 3)) {
      const content = p.content.replace(/\n/g, ' ').substring(0, 85);
      console.log('  [' + p.postedAt.substring(11, 16) + '] インプ:' + p.impressions.toLocaleString().padStart(6) + ' CTA閲覧:' + String(p.ctaViews).padStart(4));
      console.log('    ' + content + '...');
    }
  }

  console.log('\n');
  console.log('='.repeat(90));
  console.log('【クリック率WORST3の日】どんなメイン投稿があったか');
  console.log('='.repeat(90));

  for (const day of sortedByRate.slice(-3).reverse()) {
    console.log('\n■ ' + day.date + '（CTA閲覧: ' + day.ctaViews + ' → クリック: ' + day.clicks + ' = ' + day.clickRate.toFixed(1) + '%）');
    console.log('-'.repeat(85));
    for (const p of day.posts.slice(0, 3)) {
      const content = p.content.replace(/\n/g, ' ').substring(0, 85);
      console.log('  [' + p.postedAt.substring(11, 16) + '] インプ:' + p.impressions.toLocaleString().padStart(6) + ' CTA閲覧:' + String(p.ctaViews).padStart(4));
      console.log('    ' + content + '...');
    }
  }

  // 投稿内容のパターン分析
  console.log('\n');
  console.log('='.repeat(90));
  console.log('【投稿パターン分析】クリック率が高い日 vs 低い日の違い');
  console.log('='.repeat(90));

  const highDays = sortedByRate.slice(0, 3);
  const lowDays = sortedByRate.slice(-3);

  const highPosts = highDays.flatMap(d => d.posts);
  const lowPosts = lowDays.flatMap(d => d.posts);

  const keywords = ['時代遅れ', '損してます', '完全に', 'NGワード', 'プロフィール', 'シャドウバン', '1日1投稿', '10投稿', 'フック', '緊急', '速報', 'やめて', 'ヤバい', '完全に終了'];

  console.log('\n■ キーワード出現頻度比較');
  console.log('キーワード'.padEnd(15) + 'クリック率高い日'.padStart(15) + 'クリック率低い日'.padStart(15));
  console.log('-'.repeat(50));

  for (const kw of keywords) {
    const highCount = highPosts.filter(p => p.content.includes(kw)).length;
    const lowCount = lowPosts.filter(p => p.content.includes(kw)).length;
    if (highCount > 0 || lowCount > 0) {
      console.log(kw.padEnd(15) + String(highCount + '件').padStart(12) + String(lowCount + '件').padStart(15));
    }
  }
}

analyze().catch(console.error);
