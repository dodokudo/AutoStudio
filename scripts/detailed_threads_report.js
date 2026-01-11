const { BigQuery } = require('@google-cloud/bigquery');
require('dotenv').config({ path: '.env.local' });

const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
let credentials;
if (rawJson) {
  const jsonString = rawJson.startsWith('{') ? rawJson : Buffer.from(rawJson, 'base64').toString('utf8');
  credentials = JSON.parse(jsonString);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }
}

const client = new BigQuery({
  projectId: 'mark-454114',
  credentials,
  location: 'US',
});

async function main() {
  const startDate = '2025-11-13';
  const endDate = '2025-12-11';

  // 1. 日別統計
  const [dailyStats] = await client.query({
    query: `
      SELECT
        DATE(posted_at) as date,
        COUNT(*) as post_count,
        SUM(COALESCE(impressions_total, 0)) as impressions,
        SUM(COALESCE(likes_total, 0)) as likes
      FROM \`mark-454114.autostudio_threads.threads_posts\`
      WHERE DATE(posted_at) >= '${startDate}'
        AND DATE(posted_at) <= '${endDate}'
        AND post_id IS NOT NULL
        AND post_id != ''
      GROUP BY DATE(posted_at)
      ORDER BY date ASC
    `,
  });

  // 2. フォロワー推移
  const [followerStats] = await client.query({
    query: `
      SELECT date, followers_snapshot
      FROM \`mark-454114.autostudio_threads.threads_daily_metrics\`
      WHERE date >= '${startDate}'
        AND date <= '${endDate}'
      ORDER BY date ASC
    `,
  });

  // 3. 時間帯別統計
  const [hourlyStats] = await client.query({
    query: `
      SELECT
        EXTRACT(HOUR FROM posted_at) as hour,
        COUNT(*) as post_count,
        SUM(COALESCE(impressions_total, 0)) as impressions,
        SUM(COALESCE(likes_total, 0)) as likes,
        AVG(COALESCE(impressions_total, 0)) as avg_impressions
      FROM \`mark-454114.autostudio_threads.threads_posts\`
      WHERE DATE(posted_at) >= '${startDate}'
        AND DATE(posted_at) <= '${endDate}'
        AND post_id IS NOT NULL
      GROUP BY hour
      ORDER BY hour ASC
    `,
  });

  // 4. 曜日別統計
  const [dayOfWeekStats] = await client.query({
    query: `
      SELECT
        EXTRACT(DAYOFWEEK FROM posted_at) as day_of_week,
        COUNT(*) as post_count,
        SUM(COALESCE(impressions_total, 0)) as impressions,
        SUM(COALESCE(likes_total, 0)) as likes,
        AVG(COALESCE(impressions_total, 0)) as avg_impressions
      FROM \`mark-454114.autostudio_threads.threads_posts\`
      WHERE DATE(posted_at) >= '${startDate}'
        AND DATE(posted_at) <= '${endDate}'
        AND post_id IS NOT NULL
      GROUP BY day_of_week
      ORDER BY day_of_week ASC
    `,
  });

  // 5. 全投稿データ（内容含む）
  const [allPosts] = await client.query({
    query: `
      SELECT
        post_id,
        posted_at,
        impressions_total,
        likes_total,
        content
      FROM \`mark-454114.autostudio_threads.threads_posts\`
      WHERE DATE(posted_at) >= '${startDate}'
        AND DATE(posted_at) <= '${endDate}'
        AND post_id IS NOT NULL
      ORDER BY impressions_total DESC
    `,
  });

  // 6. 時間帯×曜日のクロス集計
  const [hourDayStats] = await client.query({
    query: `
      SELECT
        EXTRACT(DAYOFWEEK FROM posted_at) as day_of_week,
        EXTRACT(HOUR FROM posted_at) as hour,
        COUNT(*) as post_count,
        AVG(COALESCE(impressions_total, 0)) as avg_impressions
      FROM \`mark-454114.autostudio_threads.threads_posts\`
      WHERE DATE(posted_at) >= '${startDate}'
        AND DATE(posted_at) <= '${endDate}'
        AND post_id IS NOT NULL
      GROUP BY day_of_week, hour
      HAVING COUNT(*) >= 3
      ORDER BY avg_impressions DESC
      LIMIT 20
    `,
  });

  // 出力
  const output = {
    dailyStats: dailyStats.map(r => ({
      date: r.date.value || r.date,
      post_count: Number(r.post_count),
      impressions: Number(r.impressions),
      likes: Number(r.likes)
    })),
    followerStats: followerStats.map(r => ({
      date: r.date.value || r.date,
      followers: Number(r.followers_snapshot)
    })),
    hourlyStats: hourlyStats.map(r => ({
      hour: Number(r.hour),
      post_count: Number(r.post_count),
      impressions: Number(r.impressions),
      likes: Number(r.likes),
      avg_impressions: Math.round(Number(r.avg_impressions))
    })),
    dayOfWeekStats: dayOfWeekStats.map(r => ({
      day_of_week: Number(r.day_of_week),
      post_count: Number(r.post_count),
      impressions: Number(r.impressions),
      likes: Number(r.likes),
      avg_impressions: Math.round(Number(r.avg_impressions))
    })),
    topPosts: allPosts.slice(0, 30).map(r => ({
      posted_at: r.posted_at.value || r.posted_at,
      impressions: Number(r.impressions_total),
      likes: Number(r.likes_total),
      content: r.content || ''
    })),
    allPostsCount: allPosts.length,
    hourDayCross: hourDayStats.map(r => ({
      day_of_week: Number(r.day_of_week),
      hour: Number(r.hour),
      post_count: Number(r.post_count),
      avg_impressions: Math.round(Number(r.avg_impressions))
    }))
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(console.error);
