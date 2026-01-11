/**
 * LINE CTA ファネル分析スクリプト
 *
 * ファネル:
 * 1. 全体インプ（メイン投稿のインプレッション総数）
 * 2. CTA閲覧数（autostudio-self.vercel.appを含むコメントの閲覧数）
 * 3. リンククリック数（Threadsカテゴリのショートリンククリック数）
 * 4. LINE登録数（Lstepからの登録者数）
 *
 * Usage:
 *   npx tsx scripts/line-cta-funnel-analysis.ts
 */

import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';
import * as path from 'path';

// .env.localを先に読み、なければ.env.prodから
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.prod') });

const PROJECT_ID = 'mark-454114';
const THREADS_DATASET = 'autostudio_threads';
const LINKS_DATASET = 'autostudio_links';
const LSTEP_DATASET = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';

// 分析期間
const START_DATE = '2025-11-28';
const END_DATE = '2025-12-11';

// CTA判定用のURL（このURLを含むコメントがCTA）
const CTA_URL_PATTERN = 'autostudio-self.vercel.app';

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

interface DailyFunnel {
  date: string;
  totalImpressions: number;
  ctaViews: number;
  linkClicks: number;
  lineRegistrations: number;
  ctaRate: number;       // CTA閲覧数 / 全体インプ
  clickRate: number;     // クリック数 / CTA閲覧数
  registrationRate: number; // LINE登録 / クリック数
  overallRate: number;   // LINE登録 / 全体インプ
}

interface PostFunnel {
  postId: string;
  postedAt: string;
  content: string;
  impressions: number;
  ctaViews: number;
  ctaRate: number;
}

async function getDailyFunnel(client: BigQuery): Promise<DailyFunnel[]> {
  console.log('\n[analysis] 日別ファネルデータを取得中...');

  // 1. 日別のメイン投稿インプレッション
  const [impressionRows] = await client.query({
    query: `
      SELECT
        DATE(posted_at) as date,
        SUM(impressions_total) as impressions
      FROM \`${PROJECT_ID}.${THREADS_DATASET}.threads_posts\`
      WHERE DATE(posted_at) BETWEEN @startDate AND @endDate
      GROUP BY DATE(posted_at)
      ORDER BY date
    `,
    params: { startDate: START_DATE, endDate: END_DATE },
  });

  // 2. 日別のCTAコメント閲覧数（autostudio-self.vercel.appを含むコメント）
  const [ctaRows] = await client.query({
    query: `
      SELECT
        DATE(timestamp) as date,
        SUM(views) as cta_views
      FROM \`${PROJECT_ID}.${THREADS_DATASET}.threads_comments\`
      WHERE DATE(timestamp) BETWEEN @startDate AND @endDate
        AND LOWER(text) LIKE '%${CTA_URL_PATTERN.toLowerCase()}%'
      GROUP BY DATE(timestamp)
      ORDER BY date
    `,
    params: { startDate: START_DATE, endDate: END_DATE },
  });

  // 3. 日別のリンククリック数（Threadsカテゴリ）
  const [clickRows] = await client.query({
    query: `
      WITH latest_links AS (
        SELECT
          id,
          ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at DESC) as rn
        FROM \`${PROJECT_ID}.${LINKS_DATASET}.short_links\`
        WHERE is_active = true
          AND category = 'threads'
      )
      SELECT
        DATE(TIMESTAMP(cl.clicked_at), "Asia/Tokyo") as date,
        COUNT(*) as clicks
      FROM \`${PROJECT_ID}.${LINKS_DATASET}.click_logs\` cl
      INNER JOIN latest_links ll ON cl.short_link_id = ll.id
      WHERE ll.rn = 1
        AND DATE(TIMESTAMP(cl.clicked_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate
      GROUP BY DATE(TIMESTAMP(cl.clicked_at), "Asia/Tokyo")
      ORDER BY date
    `,
    params: { startDate: START_DATE, endDate: END_DATE },
  });

  // 4. 日別のLINE登録数
  const [registrationRows] = await client.query({
    query: `
      SELECT
        DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") as date,
        COUNT(DISTINCT user_id) as registrations
      FROM \`${PROJECT_ID}.${LSTEP_DATASET}.user_core\`
      WHERE DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate
      GROUP BY DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo")
      ORDER BY date
    `,
    params: { startDate: START_DATE, endDate: END_DATE },
  });

  // データをマージ
  const impressionMap = new Map<string, number>();
  const ctaMap = new Map<string, number>();
  const clickMap = new Map<string, number>();
  const registrationMap = new Map<string, number>();

  for (const row of impressionRows as Array<{ date: { value: string }; impressions: number }>) {
    impressionMap.set(row.date.value, Number(row.impressions));
  }
  for (const row of ctaRows as Array<{ date: { value: string }; cta_views: number }>) {
    ctaMap.set(row.date.value, Number(row.cta_views));
  }
  for (const row of clickRows as Array<{ date: { value: string }; clicks: number }>) {
    clickMap.set(row.date.value, Number(row.clicks));
  }
  for (const row of registrationRows as Array<{ date: { value: string }; registrations: number }>) {
    registrationMap.set(row.date.value, Number(row.registrations));
  }

  // すべての日付を収集
  const allDates = new Set<string>();
  [impressionMap, ctaMap, clickMap, registrationMap].forEach(map => {
    map.forEach((_, date) => allDates.add(date));
  });

  const sortedDates = Array.from(allDates).sort();
  const result: DailyFunnel[] = [];

  for (const date of sortedDates) {
    const totalImpressions = impressionMap.get(date) || 0;
    const ctaViews = ctaMap.get(date) || 0;
    const linkClicks = clickMap.get(date) || 0;
    const lineRegistrations = registrationMap.get(date) || 0;

    result.push({
      date,
      totalImpressions,
      ctaViews,
      linkClicks,
      lineRegistrations,
      ctaRate: totalImpressions > 0 ? (ctaViews / totalImpressions) * 100 : 0,
      clickRate: ctaViews > 0 ? (linkClicks / ctaViews) * 100 : 0,
      registrationRate: linkClicks > 0 ? (lineRegistrations / linkClicks) * 100 : 0,
      overallRate: totalImpressions > 0 ? (lineRegistrations / totalImpressions) * 100 : 0,
    });
  }

  return result;
}

async function getPostFunnelByRate(client: BigQuery): Promise<PostFunnel[]> {
  console.log('\n[analysis] 遷移率が高い投稿を取得中...');

  const [rows] = await client.query({
    query: `
      WITH post_data AS (
        SELECT
          post_id,
          posted_at,
          content,
          impressions_total
        FROM \`${PROJECT_ID}.${THREADS_DATASET}.threads_posts\`
        WHERE DATE(posted_at) BETWEEN @startDate AND @endDate
      ),
      cta_comments AS (
        SELECT
          parent_post_id,
          SUM(views) as cta_views
        FROM \`${PROJECT_ID}.${THREADS_DATASET}.threads_comments\`
        WHERE DATE(timestamp) BETWEEN @startDate AND @endDate
          AND LOWER(text) LIKE '%${CTA_URL_PATTERN.toLowerCase()}%'
        GROUP BY parent_post_id
      )
      SELECT
        p.post_id,
        CAST(p.posted_at AS STRING) as posted_at,
        p.content,
        p.impressions_total as impressions,
        COALESCE(c.cta_views, 0) as cta_views,
        CASE WHEN p.impressions_total > 0
          THEN (COALESCE(c.cta_views, 0) / p.impressions_total) * 100
          ELSE 0
        END as cta_rate
      FROM post_data p
      LEFT JOIN cta_comments c ON p.post_id = c.parent_post_id
      WHERE COALESCE(c.cta_views, 0) > 0
      ORDER BY cta_rate DESC
      LIMIT 20
    `,
    params: { startDate: START_DATE, endDate: END_DATE },
  });

  return (rows as Array<Record<string, unknown>>).map(row => ({
    postId: String(row.post_id),
    postedAt: String(row.posted_at),
    content: String(row.content || '').substring(0, 80),
    impressions: Number(row.impressions),
    ctaViews: Number(row.cta_views),
    ctaRate: Number(row.cta_rate),
  }));
}

async function getPostFunnelByCount(client: BigQuery): Promise<PostFunnel[]> {
  console.log('\n[analysis] 遷移数が高い投稿を取得中...');

  const [rows] = await client.query({
    query: `
      WITH post_data AS (
        SELECT
          post_id,
          posted_at,
          content,
          impressions_total
        FROM \`${PROJECT_ID}.${THREADS_DATASET}.threads_posts\`
        WHERE DATE(posted_at) BETWEEN @startDate AND @endDate
      ),
      cta_comments AS (
        SELECT
          parent_post_id,
          SUM(views) as cta_views
        FROM \`${PROJECT_ID}.${THREADS_DATASET}.threads_comments\`
        WHERE DATE(timestamp) BETWEEN @startDate AND @endDate
          AND LOWER(text) LIKE '%${CTA_URL_PATTERN.toLowerCase()}%'
        GROUP BY parent_post_id
      )
      SELECT
        p.post_id,
        CAST(p.posted_at AS STRING) as posted_at,
        p.content,
        p.impressions_total as impressions,
        COALESCE(c.cta_views, 0) as cta_views,
        CASE WHEN p.impressions_total > 0
          THEN (COALESCE(c.cta_views, 0) / p.impressions_total) * 100
          ELSE 0
        END as cta_rate
      FROM post_data p
      LEFT JOIN cta_comments c ON p.post_id = c.parent_post_id
      WHERE COALESCE(c.cta_views, 0) > 0
      ORDER BY cta_views DESC
      LIMIT 20
    `,
    params: { startDate: START_DATE, endDate: END_DATE },
  });

  return (rows as Array<Record<string, unknown>>).map(row => ({
    postId: String(row.post_id),
    postedAt: String(row.posted_at),
    content: String(row.content || '').substring(0, 80),
    impressions: Number(row.impressions),
    ctaViews: Number(row.cta_views),
    ctaRate: Number(row.cta_rate),
  }));
}

async function main() {
  console.log('='.repeat(60));
  console.log('LINE CTA ファネル分析');
  console.log(`期間: ${START_DATE} 〜 ${END_DATE}`);
  console.log('='.repeat(60));

  const client = await getBigQueryClient();

  // 日別ファネル
  const dailyFunnel = await getDailyFunnel(client);

  console.log('\n■ 日別ファネルデータ');
  console.log('-'.repeat(120));
  console.log(
    '日付'.padEnd(12) +
    '全体インプ'.padStart(12) +
    'CTA閲覧'.padStart(10) +
    'クリック'.padStart(10) +
    'LINE登録'.padStart(10) +
    'CTA率%'.padStart(10) +
    'クリック率%'.padStart(12) +
    '登録率%'.padStart(10) +
    '全体率%'.padStart(10)
  );
  console.log('-'.repeat(120));

  let totalImpressions = 0;
  let totalCtaViews = 0;
  let totalClicks = 0;
  let totalRegistrations = 0;

  for (const day of dailyFunnel) {
    totalImpressions += day.totalImpressions;
    totalCtaViews += day.ctaViews;
    totalClicks += day.linkClicks;
    totalRegistrations += day.lineRegistrations;

    console.log(
      day.date.padEnd(12) +
      day.totalImpressions.toLocaleString().padStart(12) +
      day.ctaViews.toLocaleString().padStart(10) +
      day.linkClicks.toLocaleString().padStart(10) +
      day.lineRegistrations.toLocaleString().padStart(10) +
      day.ctaRate.toFixed(2).padStart(10) +
      day.clickRate.toFixed(2).padStart(12) +
      day.registrationRate.toFixed(2).padStart(10) +
      day.overallRate.toFixed(4).padStart(10)
    );
  }

  console.log('-'.repeat(120));
  const overallCtaRate = totalImpressions > 0 ? (totalCtaViews / totalImpressions) * 100 : 0;
  const overallClickRate = totalCtaViews > 0 ? (totalClicks / totalCtaViews) * 100 : 0;
  const overallRegRate = totalClicks > 0 ? (totalRegistrations / totalClicks) * 100 : 0;
  const overallTotalRate = totalImpressions > 0 ? (totalRegistrations / totalImpressions) * 100 : 0;

  console.log(
    '合計'.padEnd(12) +
    totalImpressions.toLocaleString().padStart(12) +
    totalCtaViews.toLocaleString().padStart(10) +
    totalClicks.toLocaleString().padStart(10) +
    totalRegistrations.toLocaleString().padStart(10) +
    overallCtaRate.toFixed(2).padStart(10) +
    overallClickRate.toFixed(2).padStart(12) +
    overallRegRate.toFixed(2).padStart(10) +
    overallTotalRate.toFixed(4).padStart(10)
  );

  // 遷移率TOP投稿
  const topByRate = await getPostFunnelByRate(client);
  console.log('\n\n■ 遷移率が高い投稿 TOP20（CTA閲覧数 ÷ インプレッション）');
  console.log('-'.repeat(120));
  console.log(
    'No.'.padEnd(4) +
    '投稿日'.padEnd(22) +
    'インプ'.padStart(10) +
    'CTA閲覧'.padStart(10) +
    '遷移率%'.padStart(10) +
    '内容'
  );
  console.log('-'.repeat(120));

  topByRate.forEach((post, i) => {
    console.log(
      String(i + 1).padEnd(4) +
      post.postedAt.substring(0, 19).padEnd(22) +
      post.impressions.toLocaleString().padStart(10) +
      post.ctaViews.toLocaleString().padStart(10) +
      post.ctaRate.toFixed(2).padStart(10) +
      '  ' + post.content
    );
  });

  // 遷移数TOP投稿
  const topByCount = await getPostFunnelByCount(client);
  console.log('\n\n■ 遷移数が高い投稿 TOP20（CTA閲覧数の絶対数）');
  console.log('-'.repeat(120));
  console.log(
    'No.'.padEnd(4) +
    '投稿日'.padEnd(22) +
    'インプ'.padStart(10) +
    'CTA閲覧'.padStart(10) +
    '遷移率%'.padStart(10) +
    '内容'
  );
  console.log('-'.repeat(120));

  topByCount.forEach((post, i) => {
    console.log(
      String(i + 1).padEnd(4) +
      post.postedAt.substring(0, 19).padEnd(22) +
      post.impressions.toLocaleString().padStart(10) +
      post.ctaViews.toLocaleString().padStart(10) +
      post.ctaRate.toFixed(2).padStart(10) +
      '  ' + post.content
    );
  });

  console.log('\n' + '='.repeat(60));
  console.log('分析完了');
  console.log('='.repeat(60));
}

main().catch(console.error);
