import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { getDailyPostStats } from '@/lib/threadsInsightsData';
import { countLineSourceRegistrations } from '@/lib/lstep/dashboard';
import { getThreadsLinkClicksByRange } from '@/lib/links/analytics';

const PROJECT_ID = resolveProjectId();
const THREADS_DATASET = 'autostudio_threads';
const IG_DATASET = process.env.IG_BQ_DATASET ?? 'autostudio_instagram';
const IG_LOCATION = process.env.IG_GCP_LOCATION ?? process.env.LSTEP_BQ_LOCATION ?? 'asia-northeast1';
const IG_USER_ID = process.env.IG_DEFAULT_USER_ID ?? 'kudooo_ai';
const MF_DATASET = 'moneyforward';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyReportData {
  reportDate: string; // YYYY-MM-DD

  // LINE
  lineDelta: number;

  // Threads
  thFollowers: number;
  thFollowerDelta: number;
  thPostCount: number;
  thImpressions: number;
  thProfileClicks: number;
  thLinkClicks: number;
  thLineRegistrations: number;

  // Instagram
  igFollowers: number;
  igFollowerDelta: number;
  igPostCount: number;
  igReach: number;
  igLinkClicks: number;
  igLineRegistrations: number;
  igStoryCount: number;
  igStoryViews: number;
  igStoryViewRate: number;

  // MoneyForward 支出
  mfExpense: number;
}

export interface WeeklyReportData {
  weekStart: string;
  weekEnd: string;

  // Snapshot values at week end
  thFollowersWeekEnd: number;

  // Week deltas
  lineDelta: number;
  thFollowerDelta: number;
  thPostCount: number;
  thImpressions: number;
  thProfileClicks: number;
  thLinkClicks: number;
  thLineRegistrations: number;

  // Instagram
  igFollowersWeekEnd: number;
  igFollowerDelta: number;
  igPostCount: number;
  igReach: number;
  igLinkClicks: number;
  igLineRegistrations: number;
  igStoryCount: number;
  igStoryViews: number;

  // Weekly spending
  mfWeekExpense: number;

  // Monthly cumulative
  monthLabel: string;
  monthLineDelta: number;
  monthThFollowerDelta: number;
  monthThPostCount: number;
  monthThImpressions: number;
  monthIgFollowerDelta: number;
  monthIgReach: number;
  monthMfExpense: number;

  // Last month same period
  lastMonthLabel: string;
  lastMonthLineDelta: number;
  lastMonthThFollowerDelta: number;
  lastMonthIgFollowerDelta: number;
  lastMonthMfExpense: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00Z`);
}

function addDays(dateStr: string, days: number): string {
  const d = toDate(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateStr(d);
}

// ---------------------------------------------------------------------------
// Lightweight BigQuery queries — Threads
// ---------------------------------------------------------------------------

async function fetchThreadsMetrics(date: string): Promise<{
  followers: number;
  profileViews: number;
}> {
  const client = createBigQueryClient(PROJECT_ID);
  const [rows] = await client.query({
    query: `
      SELECT
        COALESCE(followers_snapshot, 0) AS followers,
        COALESCE(profile_views, 0) AS profile_views
      FROM \`${PROJECT_ID}.${THREADS_DATASET}.threads_daily_metrics\`
      WHERE date = @date
      LIMIT 1
    `,
    params: { date },
  });
  const row = (rows as Record<string, unknown>[])[0];
  return {
    followers: Number(row?.followers ?? 0),
    profileViews: Number(row?.profile_views ?? 0),
  };
}

async function fetchThreadsMetricsRange(startDate: string, endDate: string): Promise<{
  startFollowers: number;
  endFollowers: number;
  totalProfileViews: number;
}> {
  const client = createBigQueryClient(PROJECT_ID);
  const [rows] = await client.query({
    query: `
      SELECT
        MIN(CASE WHEN date = @startDate THEN followers_snapshot END) AS start_followers,
        MAX(CASE WHEN date = @endDate THEN followers_snapshot END) AS end_followers,
        COALESCE(SUM(profile_views), 0) AS total_profile_views
      FROM \`${PROJECT_ID}.${THREADS_DATASET}.threads_daily_metrics\`
      WHERE date BETWEEN @startDate AND @endDate
    `,
    params: { startDate, endDate },
  });
  const row = (rows as Record<string, unknown>[])[0];
  return {
    startFollowers: Number(row?.start_followers ?? 0),
    endFollowers: Number(row?.end_followers ?? 0),
    totalProfileViews: Number(row?.total_profile_views ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Lightweight BigQuery queries — Instagram
// ---------------------------------------------------------------------------

async function fetchIgInsights(date: string): Promise<{
  followers: number;
  postsCount: number;
  reach: number;
  websiteClicks: number;
}> {
  const client = createBigQueryClient(PROJECT_ID, IG_LOCATION);
  const [rows] = await client.query({
    query: `
      SELECT
        COALESCE(followers_count, 0) AS followers,
        COALESCE(posts_count, 0) AS posts_count,
        COALESCE(reach, 0) AS reach,
        COALESCE(website_clicks, 0) AS website_clicks
      FROM \`${PROJECT_ID}.${IG_DATASET}.instagram_insights\`
      WHERE user_id = @userId AND date = @date
      LIMIT 1
    `,
    params: { userId: IG_USER_ID, date },
    location: IG_LOCATION,
  });
  const row = (rows as Record<string, unknown>[])[0];
  return {
    followers: Number(row?.followers ?? 0),
    postsCount: Number(row?.posts_count ?? 0),
    reach: Number(row?.reach ?? 0),
    websiteClicks: Number(row?.website_clicks ?? 0),
  };
}

async function fetchIgInsightsRange(startDate: string, endDate: string): Promise<{
  startFollowers: number;
  endFollowers: number;
  startPostsCount: number;
  endPostsCount: number;
  totalReach: number;
  totalWebsiteClicks: number;
}> {
  const client = createBigQueryClient(PROJECT_ID, IG_LOCATION);
  const [rows] = await client.query({
    query: `
      SELECT
        MIN(CASE WHEN date = @startDate THEN followers_count END) AS start_followers,
        MAX(CASE WHEN date = @endDate THEN followers_count END) AS end_followers,
        MIN(CASE WHEN date = @startDate THEN posts_count END) AS start_posts,
        MAX(CASE WHEN date = @endDate THEN posts_count END) AS end_posts,
        COALESCE(SUM(reach), 0) AS total_reach,
        COALESCE(SUM(website_clicks), 0) AS total_website_clicks
      FROM \`${PROJECT_ID}.${IG_DATASET}.instagram_insights\`
      WHERE user_id = @userId AND date BETWEEN @startDate AND @endDate
    `,
    params: { userId: IG_USER_ID, startDate, endDate },
    location: IG_LOCATION,
  });
  const row = (rows as Record<string, unknown>[])[0];
  return {
    startFollowers: Number(row?.start_followers ?? 0),
    endFollowers: Number(row?.end_followers ?? 0),
    startPostsCount: Number(row?.start_posts ?? 0),
    endPostsCount: Number(row?.end_posts ?? 0),
    totalReach: Number(row?.total_reach ?? 0),
    totalWebsiteClicks: Number(row?.total_website_clicks ?? 0),
  };
}

async function fetchIgStorySummary(date: string): Promise<{
  storyCount: number;
  totalViews: number;
}> {
  const client = createBigQueryClient(PROJECT_ID, IG_LOCATION);
  const [rows] = await client.query({
    query: `
      SELECT
        COUNT(*) AS story_count,
        COALESCE(SUM(views), 0) AS total_views
      FROM \`${PROJECT_ID}.${IG_DATASET}.instagram_stories\`
      WHERE user_id = @userId
        AND DATE(timestamp, "Asia/Tokyo") = @date
    `,
    params: { userId: IG_USER_ID, date },
    location: IG_LOCATION,
  });
  const row = (rows as Record<string, unknown>[])[0];
  return {
    storyCount: Number(row?.story_count ?? 0),
    totalViews: Number(row?.total_views ?? 0),
  };
}

async function fetchIgStorySummaryRange(startDate: string, endDate: string): Promise<{
  storyCount: number;
  totalViews: number;
}> {
  const client = createBigQueryClient(PROJECT_ID, IG_LOCATION);
  const [rows] = await client.query({
    query: `
      SELECT
        COUNT(*) AS story_count,
        COALESCE(SUM(views), 0) AS total_views
      FROM \`${PROJECT_ID}.${IG_DATASET}.instagram_stories\`
      WHERE user_id = @userId
        AND DATE(timestamp, "Asia/Tokyo") BETWEEN @startDate AND @endDate
    `,
    params: { userId: IG_USER_ID, startDate, endDate },
    location: IG_LOCATION,
  });
  const row = (rows as Record<string, unknown>[])[0];
  return {
    storyCount: Number(row?.story_count ?? 0),
    totalViews: Number(row?.total_views ?? 0),
  };
}

// ---------------------------------------------------------------------------
// LINE registrations
// ---------------------------------------------------------------------------

/** LINE全体の新規登録数（ソース問わず） */
async function fetchLineTotalRegistrations(startDate: string, endDate: string): Promise<number> {
  const client = createBigQueryClient(PROJECT_ID, process.env.LSTEP_BQ_LOCATION);
  const datasetId = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';
  const [rows] = await client.query({
    query: `
      SELECT COUNT(DISTINCT user_id) AS total
      FROM \`${PROJECT_ID}.${datasetId}.user_core\`
      WHERE DATE(TIMESTAMP(friend_added_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate
    `,
    params: { startDate, endDate },
    location: process.env.LSTEP_BQ_LOCATION,
  });
  const row = (rows as Record<string, unknown>[])[0];
  return Number(row?.total ?? 0);
}

// ---------------------------------------------------------------------------
// MoneyForward spending queries
// ---------------------------------------------------------------------------

async function fetchDailyExpense(date: string): Promise<number> {
  const client = createBigQueryClient(PROJECT_ID);
  const [rows] = await client.query({
    query: `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM \`${PROJECT_ID}.${MF_DATASET}.transactions\`
      WHERE date = @date
        AND type = 'expense'
        AND is_transfer = FALSE
        AND is_excluded_from_calculation = FALSE
    `,
    params: { date },
  });
  const row = (rows as Record<string, unknown>[])[0];
  return Number(row?.total ?? 0);
}

async function fetchExpenseRange(startDate: string, endDate: string): Promise<number> {
  const client = createBigQueryClient(PROJECT_ID);
  const [rows] = await client.query({
    query: `
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM \`${PROJECT_ID}.${MF_DATASET}.transactions\`
      WHERE date BETWEEN @startDate AND @endDate
        AND type = 'expense'
        AND is_transfer = FALSE
        AND is_excluded_from_calculation = FALSE
    `,
    params: { startDate, endDate },
  });
  const row = (rows as Record<string, unknown>[])[0];
  return Number(row?.total ?? 0);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getDailyReportData(date: string): Promise<DailyReportData> {
  const prevDate = addDays(date, -1);
  const dateStart = toDate(date);
  const dateEnd = new Date(dateStart.getTime() + 24 * 60 * 60 * 1000 - 1);

  const [
    thToday,
    thPrev,
    thPostStats,
    thLinkClicks,
    igToday,
    igPrev,
    igStory,
    lineTotal,
    lineFromThreads,
    lineFromIg,
    mfExpense,
  ] = await Promise.all([
    fetchThreadsMetrics(date),
    fetchThreadsMetrics(prevDate),
    getDailyPostStats({ startDate: date, endDate: date }),
    getThreadsLinkClicksByRange(dateStart, dateEnd),
    fetchIgInsights(date),
    fetchIgInsights(prevDate),
    fetchIgStorySummary(date),
    fetchLineTotalRegistrations(date, date),
    countLineSourceRegistrations(PROJECT_ID, { startDate: date, endDate: date, sourceName: 'Threads' }),
    countLineSourceRegistrations(PROJECT_ID, { startDate: date, endDate: date, sourceName: 'Instagram' }),
    fetchDailyExpense(date),
  ]);

  const thPost = thPostStats[0];
  const thLinkTotal = thLinkClicks.reduce((sum, c) => sum + c.clicks, 0);
  const igPostCount = igToday.postsCount - igPrev.postsCount;
  const igStoryViewRate = igToday.followers > 0
    ? Math.round((igStory.totalViews / igToday.followers) * 1000) / 10
    : 0;

  return {
    reportDate: date,
    lineDelta: lineTotal,

    thFollowers: thToday.followers,
    thFollowerDelta: thToday.followers - thPrev.followers,
    thPostCount: thPost?.postCount ?? 0,
    thImpressions: thPost?.impressions ?? 0,
    thProfileClicks: thToday.profileViews,
    thLinkClicks: thLinkTotal,
    thLineRegistrations: lineFromThreads,

    igFollowers: igToday.followers,
    igFollowerDelta: igToday.followers - igPrev.followers,
    igPostCount: Math.max(igPostCount, 0),
    igReach: igToday.reach,
    igLinkClicks: igToday.websiteClicks,
    igLineRegistrations: lineFromIg,
    igStoryCount: igStory.storyCount,
    igStoryViews: igStory.totalViews,
    igStoryViewRate,

    mfExpense,
  };
}

export async function getWeeklyReportData(weekStart: string, weekEnd: string): Promise<WeeklyReportData> {
  const wsDate = toDate(weekStart);
  const weDate = new Date(toDate(weekEnd).getTime() + 24 * 60 * 60 * 1000 - 1);

  // Current month range
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const monthStart = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = weekEnd;

  // Last month same period
  const lastMonthStart = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth()).padStart(2, '0')}-01`;
  const lastMonthEndDay = Math.min(
    toDate(weekEnd).getUTCDate(),
    new Date(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), 0).getUTCDate(),
  );
  const lastMonthEnd = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth()).padStart(2, '0')}-${String(lastMonthEndDay).padStart(2, '0')}`;

  const [
    thWeek,
    thPostStats,
    thLinkClicks,
    igWeek,
    igStoryWeek,
    lineWeek,
    lineFromThreadsWeek,
    lineFromIgWeek,
    mfWeekExpense,

    thMonth,
    thPostMonth,
    igMonth,
    lineMonth,
    mfMonthExpense,

    thLastMonth,
    igLastMonth,
    lineLastMonth,
    mfLastMonthExpense,
  ] = await Promise.all([
    fetchThreadsMetricsRange(weekStart, weekEnd),
    getDailyPostStats({ startDate: weekStart, endDate: weekEnd }),
    getThreadsLinkClicksByRange(wsDate, weDate),
    fetchIgInsightsRange(weekStart, weekEnd),
    fetchIgStorySummaryRange(weekStart, weekEnd),
    fetchLineTotalRegistrations(weekStart, weekEnd),
    countLineSourceRegistrations(PROJECT_ID, { startDate: weekStart, endDate: weekEnd, sourceName: 'Threads' }),
    countLineSourceRegistrations(PROJECT_ID, { startDate: weekStart, endDate: weekEnd, sourceName: 'Instagram' }),
    fetchExpenseRange(weekStart, weekEnd),

    fetchThreadsMetricsRange(monthStart, monthEnd),
    getDailyPostStats({ startDate: monthStart, endDate: monthEnd }),
    fetchIgInsightsRange(monthStart, monthEnd),
    fetchLineTotalRegistrations(monthStart, monthEnd),
    fetchExpenseRange(monthStart, monthEnd),

    fetchThreadsMetricsRange(lastMonthStart, lastMonthEnd),
    fetchIgInsightsRange(lastMonthStart, lastMonthEnd),
    fetchLineTotalRegistrations(lastMonthStart, lastMonthEnd),
    fetchExpenseRange(lastMonthStart, lastMonthEnd),
  ]);

  const sumPosts = (stats: { postCount: number; impressions: number }[]) =>
    stats.reduce((acc, s) => ({ postCount: acc.postCount + s.postCount, impressions: acc.impressions + s.impressions }), { postCount: 0, impressions: 0 });

  const weekPostSum = sumPosts(thPostStats);
  const monthPostSum = sumPosts(thPostMonth);
  const thLinkTotal = thLinkClicks.reduce((sum, c) => sum + c.clicks, 0);

  return {
    weekStart,
    weekEnd,
    thFollowersWeekEnd: thWeek.endFollowers,

    lineDelta: lineWeek,
    thFollowerDelta: thWeek.endFollowers - thWeek.startFollowers,
    thPostCount: weekPostSum.postCount,
    thImpressions: weekPostSum.impressions,
    thProfileClicks: thWeek.totalProfileViews,
    thLinkClicks: thLinkTotal,
    thLineRegistrations: lineFromThreadsWeek,

    igFollowersWeekEnd: igWeek.endFollowers,
    igFollowerDelta: igWeek.endFollowers - igWeek.startFollowers,
    igPostCount: Math.max(igWeek.endPostsCount - igWeek.startPostsCount, 0),
    igReach: igWeek.totalReach,
    igLinkClicks: igWeek.totalWebsiteClicks,
    igLineRegistrations: lineFromIgWeek,
    igStoryCount: igStoryWeek.storyCount,
    igStoryViews: igStoryWeek.totalViews,

    mfWeekExpense,

    monthLabel: monthStart.slice(0, 7),
    monthLineDelta: lineMonth,
    monthThFollowerDelta: thMonth.endFollowers - thMonth.startFollowers,
    monthThPostCount: monthPostSum.postCount,
    monthThImpressions: monthPostSum.impressions,
    monthIgFollowerDelta: igMonth.endFollowers - igMonth.startFollowers,
    monthIgReach: igMonth.totalReach,
    monthMfExpense: mfMonthExpense,

    lastMonthLabel: lastMonthStart.slice(0, 7),
    lastMonthLineDelta: lineLastMonth,
    lastMonthThFollowerDelta: thLastMonth.endFollowers - thLastMonth.startFollowers,
    lastMonthIgFollowerDelta: igLastMonth.endFollowers - igLastMonth.startFollowers,
    lastMonthMfExpense: mfLastMonthExpense,
  };
}
