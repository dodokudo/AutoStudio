import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { countLineSourceRegistrations } from '@/lib/lstep/dashboard';
import { getLinkClicksSummary } from '@/lib/links/analytics';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';

interface FunnelResponse {
  impressions: number;
  linkClicks: number;
  lineRegistrations: number;
  followerDelta: number;
  postCount: number;
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

    // インプレッション（投稿の合計）を取得
    const impressionsQuery = `
      SELECT COALESCE(SUM(impressions_total), 0) AS total_impressions
      FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
      WHERE posted_at IS NOT NULL
        AND DATE(posted_at) BETWEEN @startDate AND @endDate
    `;

    // 投稿数を取得
    const postCountQuery = `
      SELECT COUNT(1) AS post_count
      FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
      WHERE posted_at IS NOT NULL
        AND DATE(posted_at) BETWEEN @startDate AND @endDate
    `;

    // フォロワー増減を取得（dailyMetricsから）
    const followerDeltaQuery = `
      WITH ordered AS (
        SELECT
          date,
          followers_snapshot,
          ROW_NUMBER() OVER (ORDER BY date ASC) AS rn_asc,
          ROW_NUMBER() OVER (ORDER BY date DESC) AS rn_desc
        FROM \`${PROJECT_ID}.${DATASET}.threads_daily_metrics\`
        WHERE date BETWEEN @startDate AND @endDate
      )
      SELECT
        COALESCE(
          (SELECT followers_snapshot FROM ordered WHERE rn_desc = 1) -
          (SELECT followers_snapshot FROM ordered WHERE rn_asc = 1),
          0
        ) AS follower_delta
    `;

    const params = { startDate, endDate };

    // 並列実行
    const [
      [impressionsRows],
      [postCountRows],
      [followerDeltaRows],
      linkClicksResult,
      lineRegistrations,
    ] = await Promise.all([
      client.query({ query: impressionsQuery, params }),
      client.query({ query: postCountQuery, params }),
      client.query({ query: followerDeltaQuery, params }),
      getLinkClicksSummary({
        startDate: new Date(`${startDate}T00:00:00Z`),
        endDate: new Date(`${endDate}T23:59:59Z`),
      }),
      countLineSourceRegistrations(PROJECT_ID, {
        startDate,
        endDate,
        sourceName: 'Threads',
      }),
    ]);

    const impressions = Number((impressionsRows[0] as { total_impressions: number })?.total_impressions ?? 0);
    const postCount = Number((postCountRows[0] as { post_count: number })?.post_count ?? 0);
    const followerDelta = Number((followerDeltaRows[0] as { follower_delta: number })?.follower_delta ?? 0);

    // Threadsカテゴリのみのクリックを取得
    const linkClicks = linkClicksResult.byCategory?.find((item) => item.category === 'threads')?.clicks ?? 0;

    const response: FunnelResponse = {
      impressions,
      linkClicks,
      lineRegistrations: lineRegistrations ?? 0,
      followerDelta,
      postCount,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[api/threads/funnel] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch funnel data' },
      { status: 500 }
    );
  }
}
