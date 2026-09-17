import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { getLineSourceNamesForAccount } from '@/lib/threadsAccounts';
import { countLineSourceRegistrations } from '@/lib/lstep/dashboard';
import { getThreadsLinkClicksByRange } from '@/lib/links/analytics';
import { getBankBalances, type BankBalance } from './bank-balances';

const PROJECT_ID = resolveProjectId();
const THREADS_DATASET = 'autostudio_threads';
const IG_DATASET = process.env.IG_BQ_DATASET ?? 'autostudio_instagram';
const IG_LOCATION = process.env.IG_GCP_LOCATION ?? process.env.LSTEP_BQ_LOCATION ?? 'asia-northeast1';
const IG_USER_ID = process.env.IG_DEFAULT_USER_ID?.trim() || 'kudooo_ai';
const MF_DATASET = 'moneyforward';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyReportData {
  reportDate: string; // YYYY-MM-DD

  // LINE
  lineDelta: number;

  // Threads
  thFollowers: number | null;
  thFollowerDelta: number | null;
  thPostCount: number;
  thImpressions: number | null;
  thLinkClicks: number;
  thLineRegistrations: number | null;

  // Instagram
  igFollowers: number | null;
  igFollowerDelta: number | null;
  igPostCount: number | null;
  igReach: number | null;
  igLinkClicks: number | null;
  igLineRegistrations: number;
  igStoryCount: number;
  igStoryViews: number | null;
  igStoryViewRate: number | null;

  igCollectedAt: string | null;

  // MoneyForward 支出
  mfExpense: number;
  mfBankBalances: BankBalance[] | null;
}

export interface WeeklyReportData {
  weekStart: string;
  weekEnd: string;

  // Snapshot values at week end
  thFollowersWeekEnd: number | null;

  // Week deltas
  lineDelta: number;
  thFollowerDelta: number | null;
  thPostCount: number;
  thImpressions: number | null;
  thLinkClicks: number;
  thLineRegistrations: number | null;

  // Instagram
  igFollowersWeekEnd: number | null;
  igFollowerDelta: number | null;
  igPostCount: number | null;
  igReach: number | null;
  igLinkClicks: number | null;
  igLineRegistrations: number;
  igStoryCount: number;
  igStoryViews: number | null;

  // Weekly spending
  mfWeekExpense: number;

  // Monthly cumulative
  monthLabel: string;
  monthLineDelta: number;
  monthThFollowerDelta: number | null;
  monthThPostCount: number;
  monthThImpressions: number | null;
  monthIgFollowerDelta: number | null;
  monthIgReach: number | null;
  monthMfExpense: number;

  // Last month same period
  lastMonthLabel: string;
  lastMonthLineDelta: number;
  lastMonthThFollowerDelta: number | null;
  lastMonthIgFollowerDelta: number | null;
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

function nullableNumber(value: unknown): number | null {
  return value == null ? null : Number(value);
}

export function metricDelta(current: number | null, previous: number | null): number | null {
  return current == null || previous == null ? null : current - previous;
}

async function fetchThreadsMetrics(date: string) {
  const client = createBigQueryClient(PROJECT_ID);
  const [rows] = await client.query({
    query: `SELECT followers_snapshot, profile_views
      FROM \`${PROJECT_ID}.${THREADS_DATASET}.threads_daily_metrics\`
      WHERE date = @date AND COALESCE(account_key, 'main') = 'main'
      ORDER BY collected_at DESC LIMIT 1`,
    params: { date },
  });
  return {
    followers: nullableNumber(rows[0]?.followers_snapshot),
    // The collector stores the API's account views in this legacy column.
    views: nullableNumber(rows[0]?.profile_views),
  };
}

async function fetchThreadsMetricsRange(startDate: string, endDate: string) {
  const client = createBigQueryClient(PROJECT_ID);
  const [rows] = await client.query({
    query: `WITH daily AS (
      SELECT date, followers_snapshot, profile_views
      FROM \`${PROJECT_ID}.${THREADS_DATASET}.threads_daily_metrics\`
      WHERE date BETWEEN DATE_SUB(DATE(@startDate), INTERVAL 1 DAY) AND DATE(@endDate)
        AND COALESCE(account_key, 'main') = 'main'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY date ORDER BY collected_at DESC) = 1
    ) SELECT
      MAX(IF(date = DATE_SUB(DATE(@startDate), INTERVAL 1 DAY), followers_snapshot, NULL)) start_followers,
      MAX(IF(date = DATE(@endDate), followers_snapshot, NULL)) end_followers,
      IF(COUNTIF(date >= DATE(@startDate) AND profile_views IS NOT NULL) = DATE_DIFF(DATE(@endDate), DATE(@startDate), DAY) + 1,
        SUM(IF(date >= DATE(@startDate), profile_views, NULL)), NULL) total_views
    FROM daily`,
    params: { startDate, endDate },
  });
  return {
    startFollowers: nullableNumber(rows[0]?.start_followers),
    endFollowers: nullableNumber(rows[0]?.end_followers),
    totalViews: nullableNumber(rows[0]?.total_views),
  };
}

// Report-specific query: JST, main account only, and errors must not become zero posts.
async function getDailyPostStats({ startDate, endDate }: { startDate: string; endDate: string; accountKey: 'main' }) {
  const client = createBigQueryClient(PROJECT_ID);
  const [rows] = await client.query({
    query: `SELECT DATE(posted_at, 'Asia/Tokyo') date, COUNT(DISTINCT post_id) post_count
      FROM \`${PROJECT_ID}.${THREADS_DATASET}.threads_posts\`
      WHERE DATE(posted_at, 'Asia/Tokyo') BETWEEN @startDate AND @endDate
        AND COALESCE(account_key, 'main') = 'main' AND post_id IS NOT NULL AND post_id != ''
      GROUP BY date`,
    params: { startDate, endDate },
  });
  return rows.map((row) => ({ postCount: Number(row.post_count) }));
}

// Use the first collection after each JST day closes. The collector requests
// the preceding 24 hours, not an exact calendar day; the message states this.
const IG_DAILY_CTE = `WITH daily AS (
  SELECT *, DATE_SUB(DATE(snapshot_at, 'Asia/Tokyo'), INTERVAL 1 DAY) report_date
  FROM \`${PROJECT_ID}.${IG_DATASET}.instagram_user_insights_snapshots\`
  WHERE user_id = @userId
    AND DATE(snapshot_at, 'Asia/Tokyo') BETWEEN DATE(@startDate) AND DATE_ADD(DATE(@endDate), INTERVAL 1 DAY)
  QUALIFY ROW_NUMBER() OVER (PARTITION BY DATE(snapshot_at, 'Asia/Tokyo') ORDER BY snapshot_at ASC) = 1
)`;

async function fetchIgInsights(date: string) {
  const client = createBigQueryClient(PROJECT_ID, IG_LOCATION);
  const [rows] = await client.query({
    query: `${IG_DAILY_CTE} SELECT * FROM daily WHERE report_date = DATE(@startDate)`,
    params: { userId: IG_USER_ID, startDate: date, endDate: date }, location: IG_LOCATION,
  });
  const row = rows[0];
  return {
    followers: nullableNumber(row?.followers_count),
    postsCount: nullableNumber(row?.media_count),
    reach: nullableNumber(row?.reach),
    websiteClicks: nullableNumber(row?.profile_links_taps),
    collectedAt: row?.snapshot_at?.value ? String(row.snapshot_at.value) : null,
  };
}

async function fetchIgInsightsRange(startDate: string, endDate: string) {
  const client = createBigQueryClient(PROJECT_ID, IG_LOCATION);
  const [rows] = await client.query({
    query: `${IG_DAILY_CTE} SELECT
      MAX(IF(report_date = DATE_SUB(DATE(@startDate), INTERVAL 1 DAY), followers_count, NULL)) start_followers,
      MAX(IF(report_date = DATE(@endDate), followers_count, NULL)) end_followers,
      MAX(IF(report_date = DATE_SUB(DATE(@startDate), INTERVAL 1 DAY), media_count, NULL)) start_posts,
      MAX(IF(report_date = DATE(@endDate), media_count, NULL)) end_posts,
      IF(COUNTIF(report_date >= DATE(@startDate) AND reach IS NOT NULL) = DATE_DIFF(DATE(@endDate), DATE(@startDate), DAY) + 1,
        SUM(IF(report_date >= DATE(@startDate), reach, NULL)), NULL) total_reach,
      IF(COUNTIF(report_date >= DATE(@startDate) AND profile_links_taps IS NOT NULL) = DATE_DIFF(DATE(@endDate), DATE(@startDate), DAY) + 1,
        SUM(IF(report_date >= DATE(@startDate), profile_links_taps, NULL)), NULL) total_website_clicks
    FROM daily`,
    params: { userId: IG_USER_ID, startDate, endDate }, location: IG_LOCATION,
  });
  const row = rows[0];
  return {
    startFollowers: nullableNumber(row?.start_followers), endFollowers: nullableNumber(row?.end_followers),
    startPostsCount: nullableNumber(row?.start_posts), endPostsCount: nullableNumber(row?.end_posts),
    totalReach: nullableNumber(row?.total_reach), totalWebsiteClicks: nullableNumber(row?.total_website_clicks),
  };
}

async function fetchIgStorySummaryRange(startDate: string, endDate: string) {
  const client = createBigQueryClient(PROJECT_ID, IG_LOCATION);
  const [rows] = await client.query({
    query: `WITH stories AS (
      SELECT instagram_id, MAX(views) views
      FROM \`${PROJECT_ID}.${IG_DATASET}.instagram_story_metric_snapshots\`
      WHERE user_id = @userId AND DATE(timestamp, 'Asia/Tokyo') BETWEEN @startDate AND @endDate
      GROUP BY instagram_id
    ) SELECT COUNT(*) story_count,
      IF(COUNT(*) > 0 AND COUNT(views) = COUNT(*), SUM(views), NULL) total_views FROM stories`,
    params: { userId: IG_USER_ID, startDate, endDate }, location: IG_LOCATION,
  });
  return { storyCount: Number(rows[0]?.story_count ?? 0), totalViews: nullableNumber(rows[0]?.total_views) };
}

async function fetchIgStorySummary(date: string) {
  return fetchIgStorySummaryRange(date, date);
}

// ---------------------------------------------------------------------------
// LINE registrations
// ---------------------------------------------------------------------------

// Older source snapshots do not identify the main account. Do not call that zero.
async function fetchMainLineRegistrations(startDate: string, endDate: string): Promise<number | null> {
  const client = createBigQueryClient(PROJECT_ID, process.env.LSTEP_BQ_LOCATION);
  const dataset = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';
  const sourceNames = getLineSourceNamesForAccount('main');
  const [rows] = await client.query({
    query: `SELECT COUNT(*) AS source_rows FROM \`${PROJECT_ID}.${dataset}.user_sources\` s
      WHERE EXISTS (SELECT 1 FROM UNNEST(@sourceNames) name WHERE s.source_name LIKE CONCAT(name, '%'))`,
    params: { sourceNames }, location: process.env.LSTEP_BQ_LOCATION,
  });
  if (!Number(rows[0]?.source_rows)) return null;
  return countLineSourceRegistrations(PROJECT_ID, { startDate, endDate, sourceNames });
}

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
    mfBankBalances,
  ] = await Promise.all([
    fetchThreadsMetrics(date),
    fetchThreadsMetrics(prevDate),
    getDailyPostStats({ startDate: date, endDate: date, accountKey: 'main' }),
    getThreadsLinkClicksByRange(dateStart, dateEnd, 'main'),
    fetchIgInsights(date),
    fetchIgInsights(prevDate),
    fetchIgStorySummary(date),
    fetchLineTotalRegistrations(date, date),
    fetchMainLineRegistrations(date, date),
    countLineSourceRegistrations(PROJECT_ID, { startDate: date, endDate: date, sourceName: 'Instagram' }),
    fetchDailyExpense(date),
    getBankBalances().catch((error) => {
      console.error('[line-report] Failed to fetch bank balances:', error);
      return null;
    }),
  ]);

  const thPost = thPostStats[0];
  const thLinkTotal = thLinkClicks.reduce((sum, c) => sum + c.clicks, 0);
  const igPostCount = metricDelta(igToday.postsCount, igPrev.postsCount);
  const igStoryViewRate = igToday.followers != null && igToday.followers > 0 && igStory.totalViews != null
    ? Math.round((igStory.totalViews / igStory.storyCount / igToday.followers) * 1000) / 10
    : null;

  return {
    reportDate: date,
    lineDelta: lineTotal,

    thFollowers: thToday.followers,
    thFollowerDelta: metricDelta(thToday.followers, thPrev.followers),
    thPostCount: thPost?.postCount ?? 0,
    thImpressions: thToday.views,
    thLinkClicks: thLinkTotal,
    thLineRegistrations: lineFromThreads,

    igFollowers: igToday.followers,
    igFollowerDelta: metricDelta(igToday.followers, igPrev.followers),
    igPostCount: igPostCount,
    igReach: igToday.reach,
    igLinkClicks: igToday.websiteClicks,
    igLineRegistrations: lineFromIg,
    igStoryCount: igStory.storyCount,
    igStoryViews: igStory.totalViews,
    igStoryViewRate,

    igCollectedAt: igToday.collectedAt,
    mfExpense,
    mfBankBalances,
  };
}

export async function getWeeklyReportData(weekStart: string, weekEnd: string): Promise<WeeklyReportData> {
  const wsDate = toDate(weekStart);
  const weDate = new Date(toDate(weekEnd).getTime() + 24 * 60 * 60 * 1000 - 1);

  // Current month range
  const jstNow = toDate(weekEnd);
  const monthStart = `${jstNow.getUTCFullYear()}-${String(jstNow.getUTCMonth() + 1).padStart(2, '0')}-01`;
  const monthEnd = weekEnd;

  // Last month same period
  const lastMonthDate = new Date(Date.UTC(jstNow.getUTCFullYear(), jstNow.getUTCMonth() - 1, 1));
  const lastMonthStart = toDateStr(lastMonthDate);
  const lastMonthEndDay = Math.min(
    toDate(weekEnd).getUTCDate(),
    new Date(jstNow.getUTCFullYear(), jstNow.getUTCMonth(), 0).getUTCDate(),
  );
  const lastMonthEnd = `${lastMonthStart.slice(0, 7)}-${String(lastMonthEndDay).padStart(2, '0')}`;

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
    getDailyPostStats({ startDate: weekStart, endDate: weekEnd, accountKey: 'main' }),
    getThreadsLinkClicksByRange(wsDate, weDate, 'main'),
    fetchIgInsightsRange(weekStart, weekEnd),
    fetchIgStorySummaryRange(weekStart, weekEnd),
    fetchLineTotalRegistrations(weekStart, weekEnd),
    fetchMainLineRegistrations(weekStart, weekEnd),
    countLineSourceRegistrations(PROJECT_ID, { startDate: weekStart, endDate: weekEnd, sourceName: 'Instagram' }),
    fetchExpenseRange(weekStart, weekEnd),

    fetchThreadsMetricsRange(monthStart, monthEnd),
    getDailyPostStats({ startDate: monthStart, endDate: monthEnd, accountKey: 'main' }),
    fetchIgInsightsRange(monthStart, monthEnd),
    fetchLineTotalRegistrations(monthStart, monthEnd),
    fetchExpenseRange(monthStart, monthEnd),

    fetchThreadsMetricsRange(lastMonthStart, lastMonthEnd),
    fetchIgInsightsRange(lastMonthStart, lastMonthEnd),
    fetchLineTotalRegistrations(lastMonthStart, lastMonthEnd),
    fetchExpenseRange(lastMonthStart, lastMonthEnd),
  ]);

  const sumPosts = (stats: { postCount: number }[]) =>
    stats.reduce((sum, stat) => sum + stat.postCount, 0);

  const weekPostSum = sumPosts(thPostStats);
  const monthPostSum = sumPosts(thPostMonth);
  const thLinkTotal = thLinkClicks.reduce((sum, c) => sum + c.clicks, 0);

  return {
    weekStart,
    weekEnd,
    thFollowersWeekEnd: thWeek.endFollowers,

    lineDelta: lineWeek,
    thFollowerDelta: metricDelta(thWeek.endFollowers, thWeek.startFollowers),
    thPostCount: weekPostSum,
    thImpressions: thWeek.totalViews,
    thLinkClicks: thLinkTotal,
    thLineRegistrations: lineFromThreadsWeek,

    igFollowersWeekEnd: igWeek.endFollowers,
    igFollowerDelta: metricDelta(igWeek.endFollowers, igWeek.startFollowers),
    igPostCount: metricDelta(igWeek.endPostsCount, igWeek.startPostsCount),
    igReach: igWeek.totalReach,
    igLinkClicks: igWeek.totalWebsiteClicks,
    igLineRegistrations: lineFromIgWeek,
    igStoryCount: igStoryWeek.storyCount,
    igStoryViews: igStoryWeek.totalViews,

    mfWeekExpense,

    monthLabel: monthStart.slice(0, 7),
    monthLineDelta: lineMonth,
    monthThFollowerDelta: metricDelta(thMonth.endFollowers, thMonth.startFollowers),
    monthThPostCount: monthPostSum,
    monthThImpressions: thMonth.totalViews,
    monthIgFollowerDelta: metricDelta(igMonth.endFollowers, igMonth.startFollowers),
    monthIgReach: igMonth.totalReach,
    monthMfExpense: mfMonthExpense,

    lastMonthLabel: lastMonthStart.slice(0, 7),
    lastMonthLineDelta: lineLastMonth,
    lastMonthThFollowerDelta: metricDelta(thLastMonth.endFollowers, thLastMonth.startFollowers),
    lastMonthIgFollowerDelta: metricDelta(igLastMonth.endFollowers, igLastMonth.startFollowers),
    lastMonthMfExpense: mfLastMonthExpense,
  };
}
