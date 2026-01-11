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
  // 日別の投稿数・インプレッション集計
  const [dailyStats] = await client.query({
    query: `
      SELECT
        DATE(posted_at) as date,
        COUNT(*) as post_count,
        SUM(COALESCE(impressions_total, 0)) as impressions,
        SUM(COALESCE(likes_total, 0)) as likes
      FROM \`mark-454114.autostudio_threads.threads_posts\`
      WHERE DATE(posted_at) >= '2025-11-13'
        AND DATE(posted_at) <= '2025-12-11'
        AND post_id IS NOT NULL
        AND post_id != ''
      GROUP BY DATE(posted_at)
      ORDER BY date ASC
    `,
  });

  console.log('=== 日別統計 (2025/11/13 - 2025/12/11) ===');
  console.log('日付\t\t投稿数\tインプレッション\tいいね');
  let totalPosts = 0, totalImpressions = 0, totalLikes = 0;
  for (const row of dailyStats) {
    const date = row.date.value || row.date;
    console.log(date + '\t' + row.post_count + '\t' + row.impressions + '\t\t' + row.likes);
    totalPosts += Number(row.post_count);
    totalImpressions += Number(row.impressions);
    totalLikes += Number(row.likes);
  }
  console.log('---');
  console.log('合計\t\t' + totalPosts + '\t' + totalImpressions + '\t\t' + totalLikes);
  const avgImp = Math.round(totalImpressions / totalPosts);
  const avgLikes = Math.round(totalLikes / totalPosts);
  console.log('平均/投稿\t-\t' + avgImp + '\t\t' + avgLikes);

  // フォロワー推移
  console.log('\n=== フォロワー推移 ===');
  const [followerStats] = await client.query({
    query: `
      SELECT date, followers_snapshot
      FROM \`mark-454114.autostudio_threads.threads_daily_metrics\`
      WHERE date >= '2025-11-13'
        AND date <= '2025-12-11'
      ORDER BY date ASC
    `,
  });
  for (const row of followerStats) {
    const date = row.date.value || row.date;
    console.log(date + '\t' + row.followers_snapshot);
  }

  // トップ投稿
  console.log('\n=== トップ10投稿（インプレッション順）===');
  const [topPosts] = await client.query({
    query: `
      SELECT
        post_id,
        DATE(posted_at) as date,
        impressions_total,
        likes_total,
        SUBSTR(content, 1, 50) as content_preview
      FROM \`mark-454114.autostudio_threads.threads_posts\`
      WHERE DATE(posted_at) >= '2025-11-13'
        AND DATE(posted_at) <= '2025-12-11'
        AND post_id IS NOT NULL
      ORDER BY impressions_total DESC
      LIMIT 10
    `,
  });
  console.log('日付\t\tインプ\tいいね\t内容');
  for (const row of topPosts) {
    const date = row.date.value || row.date;
    const preview = (row.content_preview || '').replace(/\n/g, ' ');
    console.log(date + '\t' + row.impressions_total + '\t' + row.likes_total + '\t' + preview);
  }
}

main().catch(console.error);
