/**
 * CTA閲覧数とLINE登録の相関分析
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

interface DailyData {
  date: string;
  impressions: number;
  ctaViews: number;
  clicks: number;
  registrations: number;
}

async function analyze() {
  const bigquery = await getBigQueryClient();

  // 日別の全データを取得
  const [impressionRows] = await bigquery.query({
    query: `
      SELECT
        DATE(posted_at) as date,
        SUM(impressions_total) as impressions
      FROM \`${PROJECT_ID}.autostudio_threads.threads_posts\`
      WHERE DATE(posted_at) BETWEEN '2025-11-28' AND '2025-12-11'
      GROUP BY DATE(posted_at)
    `
  });

  const [ctaRows] = await bigquery.query({
    query: `
      SELECT
        DATE(timestamp) as date,
        SUM(views) as cta_views
      FROM \`${PROJECT_ID}.autostudio_threads.threads_comments\`
      WHERE DATE(timestamp) BETWEEN '2025-11-28' AND '2025-12-11'
        AND LOWER(text) LIKE '%autostudio-self.vercel.app%'
      GROUP BY DATE(timestamp)
    `
  });

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
        AND DATE(TIMESTAMP(cl.clicked_at), 'Asia/Tokyo') BETWEEN '2025-11-28' AND '2025-12-11'
      GROUP BY DATE(TIMESTAMP(cl.clicked_at), 'Asia/Tokyo')
    `
  });

  const [regRows] = await bigquery.query({
    query: `
      SELECT
        DATE(TIMESTAMP(friend_added_at), 'Asia/Tokyo') as date,
        COUNT(DISTINCT user_id) as registrations
      FROM \`${PROJECT_ID}.autostudio_lstep.user_core\`
      WHERE DATE(TIMESTAMP(friend_added_at), 'Asia/Tokyo') BETWEEN '2025-11-28' AND '2025-12-11'
      GROUP BY DATE(TIMESTAMP(friend_added_at), 'Asia/Tokyo')
    `
  });

  // マップに変換
  const dataMap = new Map<string, Partial<DailyData>>();

  for (const r of impressionRows as Array<{ date: { value: string }; impressions: number }>) {
    const d = r.date.value;
    if (!dataMap.has(d)) dataMap.set(d, {});
    dataMap.get(d)!.impressions = Number(r.impressions);
  }
  for (const r of ctaRows as Array<{ date: { value: string }; cta_views: number }>) {
    const d = r.date.value;
    if (!dataMap.has(d)) dataMap.set(d, {});
    dataMap.get(d)!.ctaViews = Number(r.cta_views);
  }
  for (const r of clickRows as Array<{ date: { value: string }; clicks: number }>) {
    const d = r.date.value;
    if (!dataMap.has(d)) dataMap.set(d, {});
    dataMap.get(d)!.clicks = Number(r.clicks);
  }
  for (const r of regRows as Array<{ date: { value: string }; registrations: number }>) {
    const d = r.date.value;
    if (!dataMap.has(d)) dataMap.set(d, {});
    dataMap.get(d)!.registrations = Number(r.registrations);
  }

  // 配列に変換
  const data: DailyData[] = Array.from(dataMap.entries()).map(([date, vals]) => ({
    date,
    impressions: vals.impressions || 0,
    ctaViews: vals.ctaViews || 0,
    clicks: vals.clicks || 0,
    registrations: vals.registrations || 0,
  }));

  // 1. CTA閲覧数が高い順
  console.log('='.repeat(85));
  console.log('【1】CTA閲覧数が高い日 → LINE登録・クリック数との関係');
  console.log('='.repeat(85));
  console.log('順位  日付          全体インプ   CTA閲覧   クリック   LINE登録   クリック率%  登録率%');
  console.log('-'.repeat(85));

  const byCta = [...data].sort((a, b) => b.ctaViews - a.ctaViews);
  byCta.forEach((d, i) => {
    const clickRate = d.ctaViews > 0 ? (d.clicks / d.ctaViews * 100).toFixed(1) : '-';
    const regRate = d.clicks > 0 ? (d.registrations / d.clicks * 100).toFixed(1) : '-';
    console.log(
      String(i + 1).padStart(2) + '    ' +
      d.date.padEnd(12) +
      String(d.impressions.toLocaleString()).padStart(10) +
      String(d.ctaViews.toLocaleString()).padStart(10) +
      String(d.clicks.toLocaleString()).padStart(10) +
      String(d.registrations.toLocaleString()).padStart(10) +
      String(clickRate).padStart(12) +
      String(regRate).padStart(10)
    );
  });

  // 2. LINE登録数が高い順
  console.log('\n');
  console.log('='.repeat(85));
  console.log('【2】LINE登録数が多い日 → CTA閲覧・クリック数との関係');
  console.log('='.repeat(85));
  console.log('順位  日付          全体インプ   CTA閲覧   クリック   LINE登録   クリック率%  登録率%');
  console.log('-'.repeat(85));

  const byReg = [...data].sort((a, b) => b.registrations - a.registrations);
  byReg.forEach((d, i) => {
    const clickRate = d.ctaViews > 0 ? (d.clicks / d.ctaViews * 100).toFixed(1) : '-';
    const regRate = d.clicks > 0 ? (d.registrations / d.clicks * 100).toFixed(1) : '-';
    console.log(
      String(i + 1).padStart(2) + '    ' +
      d.date.padEnd(12) +
      String(d.impressions.toLocaleString()).padStart(10) +
      String(d.ctaViews.toLocaleString()).padStart(10) +
      String(d.clicks.toLocaleString()).padStart(10) +
      String(d.registrations.toLocaleString()).padStart(10) +
      String(clickRate).padStart(12) +
      String(regRate).padStart(10)
    );
  });

  // 3. 相関分析
  console.log('\n');
  console.log('='.repeat(85));
  console.log('【3】相関分析サマリー');
  console.log('='.repeat(85));

  // CTA閲覧TOP5の平均
  const ctaTop5 = byCta.slice(0, 5);
  const ctaTop5AvgReg = ctaTop5.reduce((s, d) => s + d.registrations, 0) / 5;
  const ctaTop5AvgClicks = ctaTop5.reduce((s, d) => s + d.clicks, 0) / 5;

  // LINE登録TOP5の平均
  const regTop5 = byReg.slice(0, 5);
  const regTop5AvgCta = regTop5.reduce((s, d) => s + d.ctaViews, 0) / 5;
  const regTop5AvgClicks = regTop5.reduce((s, d) => s + d.clicks, 0) / 5;

  // 全体平均
  const avgReg = data.reduce((s, d) => s + d.registrations, 0) / data.length;
  const avgCta = data.reduce((s, d) => s + d.ctaViews, 0) / data.length;
  const avgClicks = data.reduce((s, d) => s + d.clicks, 0) / data.length;

  console.log('\n■ CTA閲覧数TOP5の日（' + ctaTop5.map(d => d.date.slice(5)).join(', ') + '）');
  console.log('  平均LINE登録: ' + ctaTop5AvgReg.toFixed(1) + '人（全体平均: ' + avgReg.toFixed(1) + '人）');
  console.log('  平均クリック: ' + ctaTop5AvgClicks.toFixed(1) + '回（全体平均: ' + avgClicks.toFixed(1) + '回）');

  console.log('\n■ LINE登録TOP5の日（' + regTop5.map(d => d.date.slice(5)).join(', ') + '）');
  console.log('  平均CTA閲覧: ' + regTop5AvgCta.toFixed(1) + '（全体平均: ' + avgCta.toFixed(1) + '）');
  console.log('  平均クリック: ' + regTop5AvgClicks.toFixed(1) + '回（全体平均: ' + avgClicks.toFixed(1) + '回）');

  // 相関係数を計算
  const n = data.length;
  const sumCta = data.reduce((s, d) => s + d.ctaViews, 0);
  const sumReg = data.reduce((s, d) => s + d.registrations, 0);
  const sumCtaReg = data.reduce((s, d) => s + d.ctaViews * d.registrations, 0);
  const sumCta2 = data.reduce((s, d) => s + d.ctaViews * d.ctaViews, 0);
  const sumReg2 = data.reduce((s, d) => s + d.registrations * d.registrations, 0);

  const corrCtaReg = (n * sumCtaReg - sumCta * sumReg) /
    Math.sqrt((n * sumCta2 - sumCta * sumCta) * (n * sumReg2 - sumReg * sumReg));

  const sumClicks = data.reduce((s, d) => s + d.clicks, 0);
  const sumClicksReg = data.reduce((s, d) => s + d.clicks * d.registrations, 0);
  const sumClicks2 = data.reduce((s, d) => s + d.clicks * d.clicks, 0);

  const corrClicksReg = (n * sumClicksReg - sumClicks * sumReg) /
    Math.sqrt((n * sumClicks2 - sumClicks * sumClicks) * (n * sumReg2 - sumReg * sumReg));

  const sumCtaClicks = data.reduce((s, d) => s + d.ctaViews * d.clicks, 0);
  const corrCtaClicks = (n * sumCtaClicks - sumCta * sumClicks) /
    Math.sqrt((n * sumCta2 - sumCta * sumCta) * (n * sumClicks2 - sumClicks * sumClicks));

  console.log('\n■ 相関係数（-1〜1、1に近いほど強い正の相関）');
  console.log('  CTA閲覧 × LINE登録: ' + corrCtaReg.toFixed(3));
  console.log('  クリック × LINE登録: ' + corrClicksReg.toFixed(3));
  console.log('  CTA閲覧 × クリック: ' + corrCtaClicks.toFixed(3));

  // 解釈
  console.log('\n■ 解釈');
  if (corrCtaReg > 0.7) {
    console.log('  → CTA閲覧数とLINE登録には強い正の相関があります');
  } else if (corrCtaReg > 0.4) {
    console.log('  → CTA閲覧数とLINE登録には中程度の正の相関があります');
  } else if (corrCtaReg > 0) {
    console.log('  → CTA閲覧数とLINE登録には弱い正の相関があります');
  } else {
    console.log('  → CTA閲覧数とLINE登録には相関がほぼありません');
  }
}

analyze().catch(console.error);
