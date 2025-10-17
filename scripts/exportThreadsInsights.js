const { BigQuery } = require('@google-cloud/bigquery');
const { mkdir, writeFile } = require('fs/promises');
const path = require('path');

console.log('Starting Threads insights export (JS)...');

const PROJECT_ID = process.env.BQ_PROJECT_ID || 'mark-454114';
const THREADS_DATASET = 'autostudio_threads';
const LSTEP_DATASET = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';

const client = new BigQuery({ projectId: PROJECT_ID });

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const TIME_BANDS = [
  { label: '早朝(0-6時)', start: 0, end: 6 },
  { label: '朝(6-9時)', start: 6, end: 9 },
  { label: '午前(9-12時)', start: 9, end: 12 },
  { label: '昼(12-15時)', start: 12, end: 15 },
  { label: '午後(15-18時)', start: 15, end: 18 },
  { label: '夜(18-21時)', start: 18, end: 21 },
  { label: '深夜(21-24時)', start: 21, end: 24 },
];

function unwrapDate(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object' && 'value' in raw) {
    return typeof raw.value === 'string' ? raw.value : null;
  }
  return null;
}

function toDate(raw) {
  const value = unwrapDate(raw);
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toNumber(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function pad2(value) {
  return value.toString().padStart(2, '0');
}

function resolveTimeBand(hour) {
  const band = TIME_BANDS.find((entry) => hour >= entry.start && hour < entry.end);
  return band ? band.label : '不明';
}

function classifyPost(content) {
  const normalized = content.replace(/\s+/g, '');
  const firstLine = (content.split('\n')[0] || '').trim();

  const howtoKeywords = ['方法', '手順', 'ノウハウ', 'テクニック', 'やり方', 'マニュアル', 'ロードマップ', 'チェックリスト', '攻略', '戦略'];
  const empathyKeywords = ['分かる', '共感', '不安', '辛い', '怖い', 'しんどい', '葛藤', '悩み', 'あるある'];
  const questionKeywords = ['?', '？', '教えて', 'どう思う', 'どうする', '知ってる', '知っていますか', 'なぜ', 'どっち'];

  if (questionKeywords.some((keyword) => firstLine.includes(keyword) || normalized.includes(keyword))) {
    return '質問系';
  }
  if (howtoKeywords.some((keyword) => normalized.includes(keyword))) {
    return 'ノウハウ系';
  }
  if (empathyKeywords.some((keyword) => normalized.includes(keyword))) {
    return '共感系';
  }
  return 'ストーリー系';
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

async function fetchPosts() {
  const [rows] = await client.query({
    query: `
      SELECT post_id, posted_at, content, impressions_total, likes_total
      FROM \`${PROJECT_ID}.${THREADS_DATASET}.threads_posts\`
      WHERE posted_at IS NOT NULL
        AND content IS NOT NULL
      ORDER BY posted_at ASC
    `,
  });

  return rows
    .map((row) => {
      const postId = row.post_id ? String(row.post_id).trim() : null;
      const postedAtUtc = toDate(row.posted_at);
      const content = row.content ? String(row.content).trim() : '';
      if (!postId || !postedAtUtc || !content) return null;

      const jst = new Date(postedAtUtc.getTime() + 9 * 60 * 60 * 1000);
      const hour = jst.getUTCHours();
      const minutes = jst.getUTCMinutes();
      const weekday = WEEKDAYS[jst.getUTCDay()];
      const type = classifyPost(content);

      const impressions = toNumber(row.impressions_total);
      const likes = toNumber(row.likes_total);
      const likeRate = impressions > 0 ? likes / impressions : 0;

      const firstLine = content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)[0] || '';
      const charCount = [...content].length;
      const lineCount = content.split('\n').filter((line) => line.trim().length > 0).length;

      return {
        postId,
        postedAtUtc: postedAtUtc.toISOString(),
        postedAtJst: jst.toISOString(),
        dateJst: `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}`,
        timeJst: `${pad2(hour)}:${pad2(minutes)}`,
        weekdayJst: `(${weekday})`,
        timeBand: resolveTimeBand(hour),
        content,
        firstLine,
        charCount,
        lineCount,
        impressions,
        likes,
        likeRate,
        type,
        isWinner: impressions >= 10000,
      };
    })
    .filter(Boolean);
}

async function fetchFollowerMetrics(posts) {
  const postsByDate = new Map();
  for (const post of posts) {
    if (!postsByDate.has(post.dateJst)) {
      postsByDate.set(post.dateJst, []);
    }
    postsByDate.get(post.dateJst).push(post);
  }

  const [rows] = await client.query({
    query: `
      SELECT date, followers_snapshot, profile_views
      FROM \`${PROJECT_ID}.${THREADS_DATASET}.threads_daily_metrics\`
      WHERE date IS NOT NULL
      ORDER BY date ASC
    `,
  });

  const processed = [];
  let previousFollowers = null;

  for (const row of rows) {
    const dateIso = unwrapDate(row.date);
    if (!dateIso) continue;

    const followers = toNumber(row.followers_snapshot);
    const delta = previousFollowers !== null ? followers - previousFollowers : null;
    previousFollowers = followers;

    const sameDayPosts = postsByDate.get(dateIso) || [];
    const postImpressionsTotal = sameDayPosts.reduce((sum, post) => sum + post.impressions, 0);

    processed.push({
      date: dateIso,
      followers,
      followersDelta: delta,
      profileViews: row.profile_views !== undefined ? toNumber(row.profile_views) : null,
      postIds: sameDayPosts.map((post) => post.postId),
      postImpressionsTotal,
    });
  }

  return processed;
}

async function fetchLineRegistrations() {
  const [rows] = await client.query({
    query: `
      WITH first_seen AS (
        SELECT user_id, MIN(snapshot_date) AS first_snapshot
        FROM \`${PROJECT_ID}.${LSTEP_DATASET}.user_core\`
        GROUP BY user_id
      ),
      source_flags AS (
        SELECT
          user_id,
          MAX(IF(source_name LIKE 'Threads%', source_flag, 0)) > 0 AS from_threads_any,
          MAX(IF(source_name = 'Threads プロフ', source_flag, 0)) > 0 AS from_threads_profile,
          MAX(IF(source_name = 'Threads ポスト', source_flag, 0)) > 0 AS from_threads_post,
          MAX(IF(source_name = 'Threads', source_flag, 0)) > 0 AS from_threads_general,
          MAX(IF(source_name = 'Instagram', source_flag, 0)) > 0 AS from_instagram,
          MAX(IF(source_name = 'Youtube', source_flag, 0)) > 0 AS from_youtube
        FROM \`${PROJECT_ID}.${LSTEP_DATASET}.user_sources\`
        GROUP BY user_id
      )
      SELECT
        first_snapshot AS date,
        COUNT(*) AS total_new,
        COUNTIF(from_threads_any) AS from_threads_any,
        COUNTIF(from_threads_profile) AS from_threads_profile,
        COUNTIF(from_threads_post) AS from_threads_post,
        COUNTIF(from_threads_general) AS from_threads_general,
        COUNTIF(from_instagram) AS from_instagram,
        COUNTIF(from_youtube) AS from_youtube
      FROM first_seen f
      LEFT JOIN source_flags s USING(user_id)
      GROUP BY date
      ORDER BY date ASC
    `,
  });

  return rows.map((row) => ({
    date: unwrapDate(row.date),
    totalNew: toNumber(row.total_new),
    fromThreadsAny: toNumber(row.from_threads_any),
    fromThreadsProfile: toNumber(row.from_threads_profile),
    fromThreadsPost: toNumber(row.from_threads_post),
    fromThreadsGeneral: toNumber(row.from_threads_general),
    fromInstagram: toNumber(row.from_instagram),
    fromYoutube: toNumber(row.from_youtube),
  }));
}

function buildAggregates(posts, followerMetrics, lineRegistrations) {
  const totalImpressions = posts.reduce((sum, post) => sum + post.impressions, 0);
  const totalLikes = posts.reduce((sum, post) => sum + post.likes, 0);
  const likeRates = posts.map((post) => post.likeRate);
  const impressionsArr = posts.map((post) => post.impressions);
  const winners = posts.filter((post) => post.isWinner);

  const postTypeBreakdown = {};
  for (const post of posts) {
    if (!postTypeBreakdown[post.type]) {
      postTypeBreakdown[post.type] = {
        posts: 0,
        averageImpressions: 0,
        averageLikes: 0,
        averageLikeRate: 0,
        averageCharCount: 0,
        topExamples: [],
      };
    }
    const entry = postTypeBreakdown[post.type];
    entry.posts += 1;
    entry.averageImpressions += post.impressions;
    entry.averageLikes += post.likes;
    entry.averageLikeRate += post.likeRate;
    entry.averageCharCount += post.charCount;
    entry.topExamples.push(post);
  }

  for (const entry of Object.values(postTypeBreakdown)) {
    if (entry.posts > 0) {
      entry.averageImpressions /= entry.posts;
      entry.averageLikes /= entry.posts;
      entry.averageLikeRate /= entry.posts;
      entry.averageCharCount /= entry.posts;
      entry.topExamples = entry.topExamples.sort((a, b) => b.impressions - a.impressions).slice(0, 3);
    }
  }

  const timeBandBreakdown = {};
  for (const post of posts) {
    if (!timeBandBreakdown[post.timeBand]) {
      timeBandBreakdown[post.timeBand] = {
        posts: 0,
        averageImpressions: 0,
        averageLikes: 0,
        averageLikeRate: 0,
        totalFollowersDelta: 0,
        samplePosts: [],
      };
    }
    const entry = timeBandBreakdown[post.timeBand];
    entry.posts += 1;
    entry.averageImpressions += post.impressions;
    entry.averageLikes += post.likes;
    entry.averageLikeRate += post.likeRate;
    entry.samplePosts.push(post);
  }

  const followersDeltaByDate = followerMetrics.reduce((map, entry) => {
    map[entry.date] = entry.followersDelta || 0;
    return map;
  }, {});

  for (const entry of Object.values(timeBandBreakdown)) {
    if (entry.posts > 0) {
      entry.averageImpressions /= entry.posts;
      entry.averageLikes /= entry.posts;
      entry.averageLikeRate /= entry.posts;
      entry.samplePosts = entry.samplePosts.sort((a, b) => b.impressions - a.impressions).slice(0, 3);
      entry.totalFollowersDelta = entry.samplePosts.reduce((sum, post) => sum + (followersDeltaByDate[post.dateJst] || 0), 0);
    }
  }

  const followerSpikes = followerMetrics
    .filter((entry) => (entry.followersDelta || 0) > 0)
    .sort((a, b) => (b.followersDelta || 0) - (a.followersDelta || 0))
    .slice(0, 10)
    .map((entry) => ({
      date: entry.date,
      delta: entry.followersDelta || 0,
      followers: entry.followers,
      associatedPosts: posts
        .filter((post) => post.dateJst === entry.date)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 5),
    }));

  const winningHooks = winners
    .sort((a, b) => b.impressions - a.impressions)
    .map((post) => ({
      postId: post.postId,
      postedAtJst: post.postedAtJst,
      impressions: post.impressions,
      likes: post.likes,
      likeRate: post.likeRate,
      firstLine: post.firstLine,
      charCount: post.charCount,
      timeBand: post.timeBand,
      weekday: post.weekdayJst,
    }));

  const lineSummary = lineRegistrations.reduce(
    (acc, day) => {
      acc.totalNew += day.totalNew;
      acc.fromThreadsAny += day.fromThreadsAny;
      acc.fromThreadsProfile += day.fromThreadsProfile;
      acc.fromThreadsPost += day.fromThreadsPost;
      acc.fromThreadsGeneral += day.fromThreadsGeneral;
      acc.fromInstagram += day.fromInstagram;
      acc.fromYoutube += day.fromYoutube;
      if (day.totalNew > acc.peakTotal.count) {
        acc.peakTotal = { date: day.date, count: day.totalNew };
      }
      if (day.fromThreadsAny > acc.peakThreads.count) {
        acc.peakThreads = { date: day.date, count: day.fromThreadsAny };
      }
      return acc;
    },
    {
      totalNew: 0,
      fromThreadsAny: 0,
      fromThreadsProfile: 0,
      fromThreadsPost: 0,
      fromThreadsGeneral: 0,
      fromInstagram: 0,
      fromYoutube: 0,
      peakTotal: { date: null, count: 0 },
      peakThreads: { date: null, count: 0 },
      days: lineRegistrations.length,
    },
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
    postTypeBreakdown,
    timeBandBreakdown,
    topPosts: [...posts].sort((a, b) => b.impressions - a.impressions).slice(0, 20),
    followerSpikes,
    winningHooks,
    lineSummary,
  };
}

function buildPostsCsv(posts) {
  const header = [
    'post_id',
    'posted_at_jst',
    'date_jst',
    'time_jst',
    'weekday',
    'time_band',
    'type',
    'impressions',
    'likes',
    'like_rate',
    'char_count',
    'line_count',
    'first_line',
    'content',
  ];

  const rows = posts.map((post) => [
    post.postId,
    post.postedAtJst,
    post.dateJst,
    post.timeJst,
    post.weekdayJst,
    post.timeBand,
    post.type,
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

function buildDailySummary(posts, lineRegistrations) {
  const map = new Map();

  function ensure(date) {
    if (!map.has(date)) {
      map.set(date, {
        date,
        postsCount: 0,
        winnerCount: 0,
        totalImpressions: 0,
        totalLikes: 0,
        averageImpressions: 0,
        averageLikeRate: 0,
        lineTotalNew: 0,
        lineThreads: 0,
        lineThreadsProfile: 0,
        lineThreadsPost: 0,
        lineThreadsGeneral: 0,
        lineInstagram: 0,
        lineYoutube: 0,
        postIds: [],
      });
    }
    return map.get(date);
  }

  for (const post of posts) {
    const entry = ensure(post.dateJst);
    entry.postsCount += 1;
    entry.totalImpressions += post.impressions;
    entry.totalLikes += post.likes;
    entry.averageLikeRate += post.likeRate;
    if (post.isWinner) {
      entry.winnerCount += 1;
    }
    entry.postIds.push(post.postId);
  }

  for (const day of lineRegistrations) {
    if (!day.date) continue;
    const entry = ensure(day.date);
    entry.lineTotalNew += day.totalNew;
    entry.lineThreads += day.fromThreadsAny;
    entry.lineThreadsProfile += day.fromThreadsProfile;
    entry.lineThreadsPost += day.fromThreadsPost;
    entry.lineThreadsGeneral += day.fromThreadsGeneral;
    entry.lineInstagram += day.fromInstagram;
    entry.lineYoutube += day.fromYoutube;
  }

  for (const entry of map.values()) {
    if (entry.postsCount > 0) {
      entry.averageImpressions = entry.totalImpressions / entry.postsCount;
      entry.averageLikeRate = entry.averageLikeRate / entry.postsCount;
    }
  }

  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}

async function main() {
  const posts = await fetchPosts();
  if (!posts.length) {
    throw new Error('No posts retrieved from BigQuery.');
  }
  console.log(`Fetched posts: ${posts.length}`);

  const followerMetrics = await fetchFollowerMetrics(posts);
  console.log(`Fetched follower metrics: ${followerMetrics.length}`);

  const lineRegistrations = await fetchLineRegistrations();
  console.log(`Fetched LINE registrations: ${lineRegistrations.length}`);

  const aggregates = buildAggregates(posts, followerMetrics, lineRegistrations);
  const dailySummary = buildDailySummary(posts, lineRegistrations);

  const outputDir = path.resolve(process.cwd(), 'analysis', 'threads');
  await mkdir(outputDir, { recursive: true });

  await writeFile(path.join(outputDir, 'posts.json'), JSON.stringify(posts, null, 2), 'utf8');
  await writeFile(path.join(outputDir, 'followers.json'), JSON.stringify(followerMetrics, null, 2), 'utf8');
  await writeFile(path.join(outputDir, 'line_registrations.json'), JSON.stringify(lineRegistrations, null, 2), 'utf8');
  await writeFile(path.join(outputDir, 'aggregates.json'), JSON.stringify(aggregates, null, 2), 'utf8');
  await writeFile(path.join(outputDir, 'daily_summary.json'), JSON.stringify(dailySummary, null, 2), 'utf8');
  await writeFile(path.join(outputDir, 'posts.csv'), buildPostsCsv(posts), 'utf8');

  console.log('Threads insights export completed.');
  console.log(`Total impressions: ${aggregates.totals.totalImpressions.toLocaleString('ja-JP')}`);
  console.log(`Winner posts (>=10,000 impressions): ${aggregates.totals.winnerCount}`);
  console.log(`LINE registrations (all): ${aggregates.lineSummary.totalNew}`);
  console.log(`LINE registrations from Threads: ${aggregates.lineSummary.fromThreadsAny}`);
}

main().catch((error) => {
  console.error('Failed to export Threads insights:', error);
  process.exitCode = 1;
});
