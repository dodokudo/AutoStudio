import { NextRequest, NextResponse } from 'next/server';
import { resolveProjectId, createBigQueryClient } from '@/lib/bigquery';
import { countLineSourceRegistrations } from '@/lib/lstep/dashboard';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';

interface DailyMetric {
  date: string;
  followers: number;
  impressions: number;
  likes: number;
  postsCount: number;
  winnerCount: number;
  lineRegistrations: number;
}

interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  weekNumber: number;
  totalPosts: number;
  totalImpressions: number;
  totalLikes: number;
  winnerCount: number;
  winRate: number;
  avgImpressions: number;
  avgLikeRate: number;
  followerStart: number;
  followerEnd: number;
  followerChange: number;
  lineRegistrations: number;
  dailyAvgPosts: number;
  topPost?: {
    content: string;
    impressions: number;
    likes: number;
    postedAt: string;
  };
}

interface MonthlyReport {
  month: string;
  monthLabel: string;
  totalPosts: number;
  totalImpressions: number;
  totalLikes: number;
  winnerCount: number;
  winRate: number;
  avgImpressions: number;
  avgLikeRate: number;
  followerStart: number;
  followerEnd: number;
  followerChange: number;
  lineRegistrations: number;
  dailyAvgPosts: number;
  weeklyBreakdown: WeeklyReport[];
  topPosts: Array<{
    content: string;
    impressions: number;
    likes: number;
    postedAt: string;
  }>;
}

async function getDailyMetrics(startDate: string, endDate: string): Promise<DailyMetric[]> {
  const client = createBigQueryClient(PROJECT_ID);

  const sql = `
    WITH daily_posts AS (
      SELECT
        DATE(posted_at) AS date,
        COUNT(*) AS posts_count,
        SUM(impressions_total) AS total_impressions,
        SUM(likes_total) AS total_likes,
        COUNTIF(impressions_total >= 10000) AS winner_count
      FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
      WHERE DATE(posted_at) BETWEEN '${startDate}' AND '${endDate}'
      GROUP BY DATE(posted_at)
    ),
    daily_followers AS (
      SELECT
        date,
        followers_snapshot AS followers
      FROM \`${PROJECT_ID}.${DATASET}.threads_daily_metrics\`
      WHERE date BETWEEN '${startDate}' AND '${endDate}'
    )
    SELECT
      COALESCE(dp.date, df.date) AS date,
      COALESCE(df.followers, 0) AS followers,
      COALESCE(dp.total_impressions, 0) AS impressions,
      COALESCE(dp.total_likes, 0) AS likes,
      COALESCE(dp.posts_count, 0) AS posts_count,
      COALESCE(dp.winner_count, 0) AS winner_count
    FROM daily_posts dp
    FULL OUTER JOIN daily_followers df ON dp.date = df.date
    ORDER BY date
  `;

  console.log('[report] getDailyMetrics query:', sql.slice(0, 200));
  const [rows] = await client.query({ query: sql });
  console.log('[report] getDailyMetrics rows count:', rows.length);

  const result = (rows as Array<Record<string, unknown>>).map((row) => {
    const dateValue = row.date;
    // BigQuery returns date as { value: "2025-12-06" } object
    const dateStr = typeof dateValue === 'object' && dateValue !== null && 'value' in (dateValue as object)
      ? String((dateValue as { value: string }).value)
      : String(dateValue ?? '').split('T')[0];

    return {
      date: dateStr,
      followers: Number(row.followers ?? 0),
      impressions: Number(row.impressions ?? 0),
      likes: Number(row.likes ?? 0),
      postsCount: Number(row.posts_count ?? 0),
      winnerCount: Number(row.winner_count ?? 0),
      lineRegistrations: 0,
    };
  });

  console.log('[report] getDailyMetrics first result:', result[0]);
  return result;
}

async function getTopPosts(startDate: string, endDate: string, limit: number = 5): Promise<Array<{
  content: string;
  impressions: number;
  likes: number;
  postedAt: string;
}>> {
  const client = createBigQueryClient(PROJECT_ID);

  const sql = `
    SELECT
      content,
      impressions_total AS impressions,
      likes_total AS likes,
      FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', posted_at, 'Asia/Tokyo') AS posted_at
    FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
    WHERE DATE(posted_at) BETWEEN '${startDate}' AND '${endDate}'
      AND impressions_total >= 10000
    ORDER BY impressions_total DESC
    LIMIT ${limit}
  `;

  const [rows] = await client.query({ query: sql });

  return (rows as Array<Record<string, unknown>>).map((row) => ({
    content: String(row.content ?? ''),
    impressions: Number(row.impressions ?? 0),
    likes: Number(row.likes ?? 0),
    postedAt: String(row.posted_at ?? ''),
  }));
}

function getWeekNumber(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + startOfYear.getDay() + 1) / 7);
}

function getWeekRange(date: Date): { start: Date; end: Date } {
  const day = date.getUTCDay();
  const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday as start

  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff + 6));

  return { start, end };
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function parseDate(dateStr: string): Date {
  // Handle various date formats from BigQuery
  // "2025-12-06" or { value: "2025-12-06" }
  const cleanDate = typeof dateStr === 'object' && dateStr !== null && 'value' in (dateStr as object)
    ? String((dateStr as { value: string }).value)
    : String(dateStr);

  // Parse as UTC to avoid timezone issues
  const [year, month, day] = cleanDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

async function generateWeeklyReports(startDate: string, endDate: string): Promise<WeeklyReport[]> {
  const dailyMetrics = await getDailyMetrics(startDate, endDate);

  if (dailyMetrics.length === 0) {
    return [];
  }

  // Group by week
  const weeklyGroups = new Map<string, DailyMetric[]>();

  for (const metric of dailyMetrics) {
    const date = parseDate(metric.date);
    if (isNaN(date.getTime())) {
      console.warn('[report] Invalid date:', metric.date);
      continue;
    }
    const { start: weekStart } = getWeekRange(date);
    const weekKey = formatDate(weekStart);

    if (!weeklyGroups.has(weekKey)) {
      weeklyGroups.set(weekKey, []);
    }
    weeklyGroups.get(weekKey)!.push(metric);
  }

  const weeklyReports: WeeklyReport[] = [];

  for (const [weekStart, metrics] of weeklyGroups) {
    const weekStartDate = new Date(weekStart);
    const { end: weekEndDate } = getWeekRange(weekStartDate);
    const weekEnd = formatDate(weekEndDate);

    // Get LINE registrations for this week
    let lineRegistrations = 0;
    try {
      lineRegistrations = await countLineSourceRegistrations(PROJECT_ID, {
        startDate: weekStart,
        endDate: weekEnd,
        sourceName: 'Threads',
      });
    } catch {
      // Ignore errors
    }

    const totalPosts = metrics.reduce((sum, m) => sum + m.postsCount, 0);
    const totalImpressions = metrics.reduce((sum, m) => sum + m.impressions, 0);
    const totalLikes = metrics.reduce((sum, m) => sum + m.likes, 0);
    const winnerCount = metrics.reduce((sum, m) => sum + m.winnerCount, 0);

    const followerValues = metrics.filter(m => m.followers > 0).map(m => m.followers);
    const followerStart = followerValues[0] ?? 0;
    const followerEnd = followerValues[followerValues.length - 1] ?? followerStart;

    // Get top post for this week
    const topPosts = await getTopPosts(weekStart, weekEnd, 1);

    weeklyReports.push({
      weekStart,
      weekEnd,
      weekNumber: getWeekNumber(weekStartDate),
      totalPosts,
      totalImpressions,
      totalLikes,
      winnerCount,
      winRate: totalPosts > 0 ? (winnerCount / totalPosts) * 100 : 0,
      avgImpressions: totalPosts > 0 ? Math.round(totalImpressions / totalPosts) : 0,
      avgLikeRate: totalImpressions > 0 ? (totalLikes / totalImpressions) * 100 : 0,
      followerStart,
      followerEnd,
      followerChange: followerEnd - followerStart,
      lineRegistrations,
      dailyAvgPosts: metrics.length > 0 ? totalPosts / metrics.length : 0,
      topPost: topPosts[0],
    });
  }

  return weeklyReports.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

async function generateMonthlyReports(startDate: string, endDate: string): Promise<MonthlyReport[]> {
  const dailyMetrics = await getDailyMetrics(startDate, endDate);

  if (dailyMetrics.length === 0) {
    return [];
  }

  // Group by month
  const monthlyGroups = new Map<string, DailyMetric[]>();

  for (const metric of dailyMetrics) {
    // Handle BigQuery date format
    const dateStr = typeof metric.date === 'object' && metric.date !== null && 'value' in (metric.date as object)
      ? String((metric.date as { value: string }).value)
      : String(metric.date);
    const monthKey = dateStr.slice(0, 7); // YYYY-MM

    if (!monthlyGroups.has(monthKey)) {
      monthlyGroups.set(monthKey, []);
    }
    monthlyGroups.get(monthKey)!.push(metric);
  }

  const monthlyReports: MonthlyReport[] = [];
  const monthLabels: Record<string, string> = {
    '01': '1月', '02': '2月', '03': '3月', '04': '4月',
    '05': '5月', '06': '6月', '07': '7月', '08': '8月',
    '09': '9月', '10': '10月', '11': '11月', '12': '12月',
  };

  for (const [month, metrics] of monthlyGroups) {
    const [year, monthNum] = month.split('-');
    const monthStart = `${month}-01`;
    const lastDay = new Date(Number(year), Number(monthNum), 0).getDate();
    const monthEnd = `${month}-${lastDay.toString().padStart(2, '0')}`;

    // Get LINE registrations for this month
    let lineRegistrations = 0;
    try {
      lineRegistrations = await countLineSourceRegistrations(PROJECT_ID, {
        startDate: monthStart,
        endDate: monthEnd,
        sourceName: 'Threads',
      });
    } catch {
      // Ignore errors
    }

    const totalPosts = metrics.reduce((sum, m) => sum + m.postsCount, 0);
    const totalImpressions = metrics.reduce((sum, m) => sum + m.impressions, 0);
    const totalLikes = metrics.reduce((sum, m) => sum + m.likes, 0);
    const winnerCount = metrics.reduce((sum, m) => sum + m.winnerCount, 0);

    const followerValues = metrics.filter(m => m.followers > 0).map(m => m.followers);
    const followerStart = followerValues[0] ?? 0;
    const followerEnd = followerValues[followerValues.length - 1] ?? followerStart;

    // Get top posts for this month
    const topPosts = await getTopPosts(monthStart, monthEnd, 5);

    // Get weekly breakdown for this month
    const weeklyReports = await generateWeeklyReports(monthStart, monthEnd);

    monthlyReports.push({
      month,
      monthLabel: `${year}年${monthLabels[monthNum]}`,
      totalPosts,
      totalImpressions,
      totalLikes,
      winnerCount,
      winRate: totalPosts > 0 ? (winnerCount / totalPosts) * 100 : 0,
      avgImpressions: totalPosts > 0 ? Math.round(totalImpressions / totalPosts) : 0,
      avgLikeRate: totalImpressions > 0 ? (totalLikes / totalImpressions) * 100 : 0,
      followerStart,
      followerEnd,
      followerChange: followerEnd - followerStart,
      lineRegistrations,
      dailyAvgPosts: metrics.length > 0 ? totalPosts / metrics.length : 0,
      weeklyBreakdown: weeklyReports,
      topPosts,
    });
  }

  return monthlyReports.sort((a, b) => b.month.localeCompare(a.month));
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') ?? 'weekly'; // 'weekly' or 'monthly'
    const startDate = searchParams.get('startDate') ?? '2025-10-01';
    const endDate = searchParams.get('endDate') ?? formatDate(new Date());

    if (type === 'monthly') {
      const reports = await generateMonthlyReports(startDate, endDate);
      return NextResponse.json({ type: 'monthly', reports });
    } else {
      const reports = await generateWeeklyReports(startDate, endDate);
      return NextResponse.json({ type: 'weekly', reports });
    }
  } catch (error) {
    console.error('[threads/report] Error:', error);
    return NextResponse.json(
      { error: 'レポートの取得に失敗しました', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
