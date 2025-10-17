#!/usr/bin/env node
const { BigQuery } = require('@google-cloud/bigquery');
const { mkdir, writeFile } = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const run = promisify(execFile);

const PROJECT_ID = process.env.BQ_PROJECT_ID || 'mark-454114';
const DATASET = 'autostudio_threads';
const LOOKBACK_DAYS = Number.parseInt(process.env.LOOKBACK_DAYS ?? '30', 10);

const TARGET_ACCOUNTS = [
  { name: '門口 拓也', slug: 'monoguchi' },
  { name: 'すぎさん｜インスタアカウント設計士', slug: 'sugi' },
];

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function unwrapDate(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && 'value' in raw && typeof raw.value === 'string') return raw.value;
  return null;
}

function toDate(raw) {
  const value = unwrapDate(raw);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pad2(value) {
  return value.toString().padStart(2, '0');
}

function classifyPost(content) {
  if (!content) return 'その他';
  const normalized = content.replace(/\s+/g, '');
  const firstLine = (content.split('\n')[0] || '').trim();

  const matchers = [
    { name: 'アルゴリズム/仕様', keywords: ['アルゴ', 'ルール', '仕様', 'レコメンド', 'アクティブ', 'シグナル', 'ハッシュタグ', 'NG', '調整'] },
    { name: 'ストーリーズ/フィード', keywords: ['ストーリー', 'ストーリーズ', 'ハイライト', 'フィード', '閲覧', '窓口'] },
    { name: 'リール/動画', keywords: ['リール', '動画', '尺', '撮影', '編集', 'アフレコ', 'カット'] },
    { name: '自己開示/マインド', keywords: ['家族', 'パパ', 'ママ', '子ども', '娘', '息子', '無職', '感情', 'メンタル', '人生', '共感', '日常'] },
    { name: '運用戦略/マネタイズ', keywords: ['集客', 'マネタイズ', '売上', '導線', '商品', '戦略', '設計', 'ゼロイチ', '契約', 'クロージング'] },
  ];

  for (const matcher of matchers) {
    if (matcher.keywords.some((keyword) => firstLine.includes(keyword) || normalized.includes(keyword))) {
      return matcher.name;
    }
  }

  if (firstLine.includes('?') || firstLine.includes('？')) {
    return '問いかけ型';
  }

  return 'その他';
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

const client = new BigQuery({ projectId: PROJECT_ID });

async function fetchPosts(accountName) {
  const [rows] = await client.query({
    query: `
      SELECT post_date, content, impressions, likes, follower_count
      FROM \`${PROJECT_ID}.${DATASET}.competitor_posts_raw\`
      WHERE account_name = @accountName
        AND post_date >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @days DAY)
      ORDER BY post_date ASC
    `,
    params: { accountName, days: LOOKBACK_DAYS },
  });

  return rows
    .map((row) => {
      const postedAtUtc = toDate(row.post_date);
      if (!postedAtUtc) return null;
      const jst = new Date(postedAtUtc.getTime() + 9 * 60 * 60 * 1000);
      const content = row.content ? String(row.content) : '';
      const impressions = toNumber(row.impressions);
      const likes = toNumber(row.likes);
      const likeRate = impressions > 0 ? likes / impressions : 0;

      return {
        postedAtUtc: postedAtUtc.toISOString(),
        postedAtJst: jst.toISOString(),
        dateJst: `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}`,
        timeJst: `${pad2(jst.getUTCHours())}:${pad2(jst.getUTCMinutes())}`,
        weekdayJst: `(${WEEKDAYS[jst.getUTCDay()]})`,
        content,
        firstLine: content.split('\n').map((line) => line.trim()).filter(Boolean)[0] || '',
        impressions,
        likes,
        likeRate,
        followerCountAtPost: toNumber(row.follower_count),
        charCount: [...content].length,
        lineCount: content.split('\n').filter((line) => line.trim().length > 0).length,
        category: classifyPost(content),
        isWinner: impressions >= 10000,
      };
    })
    .filter(Boolean);
}

async function fetchDaily(accountName) {
  const [rows] = await client.query({
    query: `
      SELECT date, followers, followers_delta, posts_count, views
      FROM \`${PROJECT_ID}.${DATASET}.competitor_account_daily\`
      WHERE account_name = @accountName
        AND date >= DATE_SUB(CURRENT_DATE(), INTERVAL @days DAY)
      ORDER BY date ASC
    `,
    params: { accountName, days: LOOKBACK_DAYS },
  });

  return rows.map((row) => ({
    date: unwrapDate(row.date),
    followers: toNumber(row.followers),
    followersDelta: toNumber(row.followers_delta),
    postsCount: toNumber(row.posts_count),
    views: toNumber(row.views),
  }));
}

function buildAggregates(posts, daily) {
  const totalImpressions = posts.reduce((sum, post) => sum + post.impressions, 0);
  const totalLikes = posts.reduce((sum, post) => sum + post.likes, 0);
  const likeRates = posts.map((post) => post.likeRate);
  const impressionsArr = posts.map((post) => post.impressions);
  const winners = posts.filter((post) => post.isWinner);
  const topPostsSorted = [...posts].sort((a, b) => b.impressions - a.impressions);

  const categoryBreakdown = posts.reduce((acc, post) => {
    if (!acc[post.category]) {
      acc[post.category] = {
        name: post.category,
        posts: 0,
        impressions: 0,
        likes: 0,
        likeRateTotal: 0,
        topExamples: [],
      };
    }
    const entry = acc[post.category];
    entry.posts += 1;
    entry.impressions += post.impressions;
    entry.likes += post.likes;
    entry.likeRateTotal += post.likeRate;
    entry.topExamples.push(post);
    return acc;
  }, {});

  Object.values(categoryBreakdown).forEach((entry) => {
    if (entry.posts > 0) {
      entry.averageImpressions = entry.impressions / entry.posts;
      entry.averageLikes = entry.likes / entry.posts;
      entry.averageLikeRate = entry.likeRateTotal / entry.posts;
      entry.topExamples = entry.topExamples.sort((a, b) => b.impressions - a.impressions).slice(0, 2);
    }
  });

  const followerSummary = daily.reduce(
    (acc, day) => {
      acc.totalDelta += day.followersDelta;
      if (day.followersDelta > acc.peakDelta.delta) {
        acc.peakDelta = { date: day.date, delta: day.followersDelta };
      }
      acc.data.push(day);
      return acc;
    },
    { totalDelta: 0, peakDelta: { date: null, delta: 0 }, data: [] },
  );

  return {
    totals: {
      posts: posts.length,
      totalImpressions,
      averageImpressions: posts.length ? totalImpressions / posts.length : 0,
      medianImpressions: median(impressionsArr),
      totalLikes,
      averageLikeRate: likeRates.length ? likeRates.reduce((sum, rate) => sum + rate, 0) / likeRates.length : 0,
      winnerCount: winners.length,
    },
    categoryBreakdown,
    topPosts: topPostsSorted.slice(0, 20),
    topPosts10: topPostsSorted.slice(0, 10),
    followerSummary,
  };
}

function buildDailySummary(posts, daily) {
  const byDate = new Map();
  function ensure(date) {
    if (!byDate.has(date)) {
      byDate.set(date, {
        date,
        postsCount: 0,
        winnerCount: 0,
        impressions: 0,
        likes: 0,
        averageImpressions: 0,
        averageLikeRate: 0,
        followers: null,
        followersDelta: null,
        views: null,
      });
    }
    return byDate.get(date);
  }

  posts.forEach((post) => {
    const entry = ensure(post.dateJst);
    entry.postsCount += 1;
    entry.impressions += post.impressions;
    entry.likes += post.likes;
    entry.averageLikeRate += post.likeRate;
    if (post.isWinner) entry.winnerCount += 1;
  });

  daily.forEach((day) => {
    const entry = ensure(day.date);
    entry.followers = day.followers;
    entry.followersDelta = day.followersDelta;
    entry.views = day.views;
  });

  for (const entry of byDate.values()) {
    if (entry.postsCount > 0) {
      entry.averageImpressions = entry.impressions / entry.postsCount;
      entry.averageLikeRate = entry.averageLikeRate / entry.postsCount;
    }
  }

  return [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

function postsToCsv(posts) {
  const header = [
    'posted_at_jst',
    'date_jst',
    'time_jst',
    'weekday',
    'category',
    'impressions',
    'likes',
    'like_rate',
    'char_count',
    'line_count',
    'first_line',
    'content',
  ];

  const rows = posts.map((post) => [
    post.postedAtJst,
    post.dateJst,
    post.timeJst,
    post.weekdayJst,
    post.category,
    post.impressions,
    post.likes,
    post.likeRate.toFixed(4),
    post.charCount,
    post.lineCount,
    `"${post.firstLine.replace(/"/g, '""')}"`,
    `"${post.content.replace(/"/g, '""').replace(/\n/g, '\\n')}"`,
  ]);

  return [header.join(','), ...rows.map((row) => row.join(','))].join('\n');
}

async function renderHtml(slug) {
  try {
    await run('node', [path.join('scripts', 'renderCompetitorReport.js'), slug]);
  } catch (error) {
    console.warn(`[render] ${slug} HTML generation failed`, error.message);
  }
}

async function exportForAccount(account) {
  console.log(`\n▶ ${account.name} (${account.slug})`);
  const posts = await fetchPosts(account.name);
  const daily = await fetchDaily(account.name);
  const aggregates = buildAggregates(posts, daily);
  const dailySummary = buildDailySummary(posts, daily);

  const outputDir = path.join('analysis', 'competitors', account.slug);
  await mkdir(outputDir, { recursive: true });

  await writeFile(path.join(outputDir, 'posts.json'), JSON.stringify(posts, null, 2), 'utf8');
  await writeFile(path.join(outputDir, 'daily_summary.json'), JSON.stringify(dailySummary, null, 2), 'utf8');
  await writeFile(path.join(outputDir, 'aggregates.json'), JSON.stringify(aggregates, null, 2), 'utf8');
  await writeFile(path.join(outputDir, 'posts.csv'), postsToCsv(posts), 'utf8');

  await renderHtml(account.slug);

  console.log(`  posts: ${posts.length}`);
  console.log(`  total impressions: ${aggregates.totals.totalImpressions.toLocaleString('ja-JP')}`);
  console.log(`  winner posts: ${aggregates.totals.winnerCount}`);
}

async function main() {
  for (const account of TARGET_ACCOUNTS) {
    await exportForAccount(account);
  }
  console.log('\n✓ competitor insights export completed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
