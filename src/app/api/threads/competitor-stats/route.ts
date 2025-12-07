import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';

interface CompetitorStats {
  accountName: string;
  username: string;
  currentFollowers: number;
  followerDelta: number;
  dailyFollowerDelta: number;
  totalImpressions: number;
  totalLikes: number;
  postCount: number;
  avgImpressions: number;
  avgLikes: number;
  latestPostDate: string;
  isSelf: boolean;
}

interface CompetitorStatsResponse {
  competitors: CompetitorStats[];
  startDate: string;
  endDate: string;
  totalAccounts: number;
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

    // 期間の日数を計算
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const daysDiff = Math.max(1, Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)));

    // 競合アカウントのデータ取得
    const [competitorRows] = await client.query({
      query: `
        WITH post_stats AS (
          SELECT
            account_name,
            username,
            COUNT(1) as post_count,
            SUM(impressions) as total_impressions,
            SUM(likes) as total_likes,
            MAX(DATE(post_date)) as latest_post_date
          FROM \`${PROJECT_ID}.${DATASET}.competitor_posts_raw\`
          WHERE post_date IS NOT NULL
            AND DATE(post_date) BETWEEN @startDate AND @endDate
          GROUP BY account_name, username
        ),
        account_followers AS (
          SELECT
            username,
            ARRAY_AGG(followers ORDER BY date DESC LIMIT 1)[OFFSET(0)] as current_followers,
            ARRAY_AGG(followers ORDER BY date ASC LIMIT 1)[OFFSET(0)] as start_followers
          FROM \`${PROJECT_ID}.${DATASET}.competitor_account_daily\`
          WHERE date BETWEEN @startDate AND @endDate
          GROUP BY username
        )
        SELECT
          p.account_name,
          p.username,
          p.post_count,
          p.total_impressions,
          p.total_likes,
          p.latest_post_date,
          COALESCE(a.current_followers, 0) as current_followers,
          COALESCE(a.current_followers - a.start_followers, 0) as follower_delta
        FROM post_stats p
        LEFT JOIN account_followers a ON p.username = a.username
        ORDER BY p.total_impressions DESC
      `,
      params: { startDate, endDate },
    });

    // 自分のアカウントのデータ取得
    const [selfRows] = await client.query({
      query: `
        WITH self_followers AS (
          SELECT
            ARRAY_AGG(followers_snapshot ORDER BY date DESC LIMIT 1)[OFFSET(0)] as current_followers,
            ARRAY_AGG(followers_snapshot ORDER BY date ASC LIMIT 1)[OFFSET(0)] as start_followers
          FROM \`${PROJECT_ID}.${DATASET}.threads_daily_metrics\`
          WHERE date BETWEEN @startDate AND @endDate
        ),
        self_posts AS (
          SELECT
            COUNT(1) as post_count,
            SUM(impressions_total) as total_impressions,
            SUM(likes_total) as total_likes,
            MAX(DATE(posted_at)) as latest_post_date
          FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
          WHERE posted_at IS NOT NULL
            AND DATE(posted_at) BETWEEN @startDate AND @endDate
        )
        SELECT
          f.current_followers,
          f.start_followers,
          p.post_count,
          p.total_impressions,
          p.total_likes,
          p.latest_post_date
        FROM self_followers f, self_posts p
      `,
      params: { startDate, endDate },
    });

    type CompetitorRow = {
      account_name: string;
      username: string;
      post_count: number;
      total_impressions: number;
      total_likes: number;
      latest_post_date: { value: string } | string;
      current_followers: number;
      follower_delta: number;
    };

    type SelfRow = {
      current_followers: number;
      start_followers: number;
      post_count: number;
      total_impressions: number;
      total_likes: number;
      latest_post_date: { value: string } | string | null;
    };

    // 自分のアカウントを最初に追加
    const selfData = (selfRows as SelfRow[])[0];
    const selfFollowerDelta = (selfData?.current_followers || 0) - (selfData?.start_followers || 0);
    const selfPostCount = selfData?.post_count || 0;
    const selfTotalImpressions = selfData?.total_impressions || 0;

    let selfLatestPostDate = '';
    if (selfData?.latest_post_date) {
      if (typeof selfData.latest_post_date === 'object' && 'value' in selfData.latest_post_date) {
        selfLatestPostDate = selfData.latest_post_date.value;
      } else {
        selfLatestPostDate = String(selfData.latest_post_date);
      }
    }

    const selfAccount: CompetitorStats = {
      accountName: '自分のアカウント',
      username: 'threads_kudo',
      currentFollowers: selfData?.current_followers || 0,
      followerDelta: selfFollowerDelta,
      dailyFollowerDelta: daysDiff > 0 ? Math.round(selfFollowerDelta / daysDiff * 10) / 10 : 0,
      totalImpressions: selfTotalImpressions,
      totalLikes: selfData?.total_likes || 0,
      postCount: selfPostCount,
      avgImpressions: selfPostCount > 0 ? Math.round(selfTotalImpressions / selfPostCount) : 0,
      avgLikes: selfPostCount > 0 ? Math.round((selfData?.total_likes || 0) / selfPostCount) : 0,
      latestPostDate: selfLatestPostDate,
      isSelf: true,
    };

    // 競合アカウントのデータ
    const competitors: CompetitorStats[] = (competitorRows as CompetitorRow[]).map((row) => {
      const postCount = row.post_count || 0;
      const totalImpressions = row.total_impressions || 0;
      const totalLikes = row.total_likes || 0;
      const followerDelta = row.follower_delta || 0;

      let latestPostDate = '';
      if (row.latest_post_date) {
        if (typeof row.latest_post_date === 'object' && 'value' in row.latest_post_date) {
          latestPostDate = row.latest_post_date.value;
        } else {
          latestPostDate = String(row.latest_post_date);
        }
      }

      return {
        accountName: row.account_name || 'unknown',
        username: row.username || '',
        currentFollowers: row.current_followers || 0,
        followerDelta,
        dailyFollowerDelta: daysDiff > 0 ? Math.round(followerDelta / daysDiff * 10) / 10 : 0,
        totalImpressions,
        totalLikes,
        postCount,
        avgImpressions: postCount > 0 ? Math.round(totalImpressions / postCount) : 0,
        avgLikes: postCount > 0 ? Math.round(totalLikes / postCount) : 0,
        latestPostDate,
        isSelf: false,
      };
    });

    // 自分を先頭に追加
    const allAccounts = [selfAccount, ...competitors];

    const response: CompetitorStatsResponse = {
      competitors: allAccounts,
      startDate,
      endDate,
      totalAccounts: allAccounts.length,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[api/threads/competitor-stats] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch competitor stats' },
      { status: 500 }
    );
  }
}
