import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';

interface TopPost {
  postId: string;
  text: string;
  impressions: number;
  likes: number;
  postDate: string;
}

interface DailyMetric {
  date: string;
  impressions: number;
  likes: number;
  followers: number;
  followerChange: number;
}

interface CompetitorDetail {
  username: string;
  accountName: string;
  topPosts: TopPost[];
  allPosts: TopPost[];
  dailyMetrics: DailyMetric[];
  currentFollowers: number;
  followerDelta: number;
  dailyFollowerDelta: number;
  postCount: number;
  avgImpressions: number;
  isSelf: boolean;
}

function isValidDate(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return !Number.isNaN(date.getTime());
}

export async function GET(request: Request) {
  if (!PROJECT_ID) {
    return NextResponse.json({ error: 'Project ID is not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }

  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const client = createBigQueryClient(PROJECT_ID);

    // 競合アカウントの全投稿取得（ランク付き）
    const [competitorPosts] = await client.query({
      query: `
        WITH ranked_posts AS (
          SELECT
            account_name,
            username,
            CONCAT(username, '_', FORMAT_TIMESTAMP('%Y%m%d%H%M%S', post_date)) as post_id,
            content as main_text,
            impressions,
            likes,
            DATE(post_date) as post_date,
            ROW_NUMBER() OVER (PARTITION BY username ORDER BY impressions DESC) as rank
          FROM \`${PROJECT_ID}.${DATASET}.competitor_posts_raw\`
          WHERE post_date IS NOT NULL
            AND DATE(post_date) BETWEEN @startDate AND @endDate
        )
        SELECT
          account_name,
          username,
          post_id,
          main_text,
          impressions,
          likes,
          post_date,
          rank
        FROM ranked_posts
        ORDER BY username, impressions DESC
      `,
      params: { startDate, endDate },
    });

    // 競合アカウントの日次集計
    const [competitorDaily] = await client.query({
      query: `
        SELECT
          username,
          DATE(post_date) as date,
          SUM(impressions) as impressions,
          SUM(likes) as likes
        FROM \`${PROJECT_ID}.${DATASET}.competitor_posts_raw\`
        WHERE post_date IS NOT NULL
          AND DATE(post_date) BETWEEN @startDate AND @endDate
        GROUP BY username, DATE(post_date)
        ORDER BY username, date
      `,
      params: { startDate, endDate },
    });

    // 自分の全投稿取得
    const [selfPosts] = await client.query({
      query: `
        SELECT
          post_id,
          content as main_text,
          impressions_total as impressions,
          likes_total as likes,
          DATE(posted_at) as post_date
        FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
        WHERE posted_at IS NOT NULL
          AND DATE(posted_at) BETWEEN @startDate AND @endDate
        ORDER BY impressions_total DESC
      `,
      params: { startDate, endDate },
    });

    // 自分の日次集計
    const [selfDaily] = await client.query({
      query: `
        SELECT
          DATE(posted_at) as date,
          SUM(impressions_total) as impressions,
          SUM(likes_total) as likes
        FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
        WHERE posted_at IS NOT NULL
          AND DATE(posted_at) BETWEEN @startDate AND @endDate
        GROUP BY DATE(posted_at)
        ORDER BY date
      `,
      params: { startDate, endDate },
    });

    // 競合アカウントのフォロワー情報取得
    const [competitorFollowers] = await client.query({
      query: `
        SELECT
          username,
          ARRAY_AGG(followers ORDER BY date DESC LIMIT 1)[OFFSET(0)] as current_followers,
          ARRAY_AGG(followers ORDER BY date ASC LIMIT 1)[OFFSET(0)] as start_followers
        FROM \`${PROJECT_ID}.${DATASET}.competitor_account_daily\`
        WHERE date BETWEEN @startDate AND @endDate
        GROUP BY username
      `,
      params: { startDate, endDate },
    });

    // 競合アカウントの日次フォロワー推移取得
    const [competitorDailyFollowers] = await client.query({
      query: `
        SELECT
          username,
          date,
          followers,
          followers - COALESCE(LAG(followers, 1) OVER (PARTITION BY username ORDER BY date), followers) as follower_change
        FROM \`${PROJECT_ID}.${DATASET}.competitor_account_daily\`
        WHERE date BETWEEN @startDate AND @endDate
        ORDER BY username, date
      `,
      params: { startDate, endDate },
    });

    // 自分のフォロワー情報取得
    const [selfFollowers] = await client.query({
      query: `
        SELECT
          ARRAY_AGG(followers_snapshot ORDER BY date DESC LIMIT 1)[OFFSET(0)] as current_followers,
          ARRAY_AGG(followers_snapshot ORDER BY date ASC LIMIT 1)[OFFSET(0)] as start_followers
        FROM \`${PROJECT_ID}.${DATASET}.threads_daily_metrics\`
        WHERE date BETWEEN @startDate AND @endDate
      `,
      params: { startDate, endDate },
    });

    // 自分の日次フォロワー推移取得
    const [selfDailyFollowers] = await client.query({
      query: `
        SELECT
          date,
          followers_snapshot as followers,
          followers_snapshot - COALESCE(LAG(followers_snapshot, 1) OVER (ORDER BY date), followers_snapshot) as follower_change
        FROM \`${PROJECT_ID}.${DATASET}.threads_daily_metrics\`
        WHERE date BETWEEN @startDate AND @endDate
        ORDER BY date
      `,
      params: { startDate, endDate },
    });

    type PostRow = {
      account_name?: string;
      username?: string;
      post_id: string;
      main_text: string;
      impressions: number;
      likes: number;
      post_date: { value: string } | string;
      rank?: number;
    };

    type DailyRow = {
      username?: string;
      date: { value: string } | string;
      impressions: number;
      likes: number;
    };

    type DailyFollowerRow = {
      username?: string;
      date: { value: string } | string;
      followers: number;
      follower_change: number;
    };

    type FollowerRow = {
      username?: string;
      current_followers: number;
      start_followers: number;
    };

    const extractDate = (d: { value: string } | string | null): string => {
      if (!d) return '';
      if (typeof d === 'object' && 'value' in d) return d.value;
      return String(d);
    };

    // フォロワー情報をマップ化
    const followerMap = new Map<string, { current: number; delta: number }>();
    for (const row of competitorFollowers as FollowerRow[]) {
      const username = row.username || '';
      const current = row.current_followers || 0;
      const start = row.start_followers || 0;
      followerMap.set(username, { current, delta: current - start });
    }

    // 期間の日数を計算
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const daysDiff = Math.max(1, Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)));

    // 競合アカウントをグループ化
    const competitorMap = new Map<string, CompetitorDetail>();

    for (const row of competitorPosts as PostRow[]) {
      const username = row.username || '';
      if (!competitorMap.has(username)) {
        const followerInfo = followerMap.get(username) || { current: 0, delta: 0 };
        competitorMap.set(username, {
          username,
          accountName: row.account_name || 'unknown',
          topPosts: [],
          allPosts: [],
          dailyMetrics: [],
          currentFollowers: followerInfo.current,
          followerDelta: followerInfo.delta,
          dailyFollowerDelta: daysDiff > 0 ? Math.round(followerInfo.delta / daysDiff * 10) / 10 : 0,
          postCount: 0,
          avgImpressions: 0,
          isSelf: false,
        });
      }
      const post = {
        postId: row.post_id,
        text: row.main_text || '',
        impressions: row.impressions || 0,
        likes: row.likes || 0,
        postDate: extractDate(row.post_date),
      };
      // トップ3だけtopPostsに追加
      if ((row.rank || 0) <= 3) {
        competitorMap.get(username)!.topPosts.push(post);
      }
      // 全投稿はallPostsに追加
      competitorMap.get(username)!.allPosts.push(post);
    }

    // 投稿数と平均インプレッションを計算
    for (const [, detail] of competitorMap) {
      detail.postCount = detail.allPosts.length;
      const totalImp = detail.allPosts.reduce((sum, p) => sum + p.impressions, 0);
      detail.avgImpressions = detail.postCount > 0 ? Math.round(totalImp / detail.postCount) : 0;
    }

    // 競合アカウントの日次フォロワーデータをマップ化
    const competitorDailyFollowerMap = new Map<string, Map<string, { followers: number; change: number }>>();
    for (const row of competitorDailyFollowers as DailyFollowerRow[]) {
      const username = row.username || '';
      const date = extractDate(row.date);
      if (!competitorDailyFollowerMap.has(username)) {
        competitorDailyFollowerMap.set(username, new Map());
      }
      competitorDailyFollowerMap.get(username)!.set(date, {
        followers: row.followers || 0,
        change: row.follower_change || 0,
      });
    }

    // 競合アカウントの日次インプレッションデータをマップ化
    const competitorDailyImpMap = new Map<string, Map<string, { impressions: number; likes: number }>>();
    for (const row of competitorDaily as DailyRow[]) {
      const username = row.username || '';
      const date = extractDate(row.date);
      if (!competitorDailyImpMap.has(username)) {
        competitorDailyImpMap.set(username, new Map());
      }
      competitorDailyImpMap.get(username)!.set(date, {
        impressions: row.impressions || 0,
        likes: row.likes || 0,
      });
    }

    // フォロワーとインプレッションデータを統合
    for (const [username, followerData] of competitorDailyFollowerMap) {
      if (competitorMap.has(username)) {
        const impData = competitorDailyImpMap.get(username) || new Map();
        const metrics: DailyMetric[] = [];
        for (const [date, fData] of followerData) {
          const iData = impData.get(date) || { impressions: 0, likes: 0 };
          metrics.push({
            date,
            impressions: iData.impressions,
            likes: iData.likes,
            followers: fData.followers,
            followerChange: fData.change,
          });
        }
        // 日付順にソート
        metrics.sort((a, b) => a.date.localeCompare(b.date));
        competitorMap.get(username)!.dailyMetrics = metrics;
      }
    }

    // 自分のフォロワー情報を取得
    const selfFollowerData = (selfFollowers as FollowerRow[])[0];
    const selfCurrentFollowers = selfFollowerData?.current_followers || 0;
    const selfStartFollowers = selfFollowerData?.start_followers || 0;

    // 自分の日次インプレッションデータをマップ化
    const selfDailyImpMap = new Map<string, { impressions: number; likes: number }>();
    for (const row of selfDaily as DailyRow[]) {
      const date = extractDate(row.date);
      selfDailyImpMap.set(date, {
        impressions: row.impressions || 0,
        likes: row.likes || 0,
      });
    }

    // 自分の日次フォロワーデータとインプレッションを統合
    const selfDailyMetrics: DailyMetric[] = (selfDailyFollowers as DailyFollowerRow[]).map((row) => {
      const date = extractDate(row.date);
      const impData = selfDailyImpMap.get(date) || { impressions: 0, likes: 0 };
      return {
        date,
        impressions: impData.impressions,
        likes: impData.likes,
        followers: row.followers || 0,
        followerChange: row.follower_change || 0,
      };
    });

    // 自分の全投稿を変換
    const selfAllPosts = (selfPosts as PostRow[]).map((row) => ({
      postId: row.post_id,
      text: row.main_text || '',
      impressions: row.impressions || 0,
      likes: row.likes || 0,
      postDate: extractDate(row.post_date),
    }));
    const selfPostCount = selfAllPosts.length;
    const selfTotalImp = selfAllPosts.reduce((sum, p) => sum + p.impressions, 0);
    const selfFollowerDelta = selfCurrentFollowers - selfStartFollowers;

    // 自分のアカウント
    const selfDetail: CompetitorDetail = {
      username: 'threads_kudo',
      accountName: '自分のアカウント',
      topPosts: selfAllPosts.slice(0, 3),
      allPosts: selfAllPosts,
      dailyMetrics: selfDailyMetrics,
      currentFollowers: selfCurrentFollowers,
      followerDelta: selfFollowerDelta,
      dailyFollowerDelta: daysDiff > 0 ? Math.round(selfFollowerDelta / daysDiff * 10) / 10 : 0,
      postCount: selfPostCount,
      avgImpressions: selfPostCount > 0 ? Math.round(selfTotalImp / selfPostCount) : 0,
      isSelf: true,
    };

    // 自分を先頭に追加
    const allDetails = [selfDetail, ...Array.from(competitorMap.values())];

    return NextResponse.json({ accounts: allDetails, startDate, endDate }, { status: 200 });
  } catch (error) {
    console.error('[api/threads/competitor-detail] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch competitor details' },
      { status: 500 }
    );
  }
}
