/**
 * 月次実績データ取得
 */
import { createBigQueryClient, resolveProjectId } from '../bigquery';
import { getChargeCategories, getManualSales, type SalesCategoryId } from '@/lib/sales/categories';
import { getAllGroups, type TransactionGroupItem } from '@/lib/sales/groups';
import { getThreadsInsightsData } from '@/lib/threadsInsightsData';
import { getInstagramDashboardData } from '@/lib/instagram/dashboard';

const PROJECT_ID = resolveProjectId();

// ============================================================
// 型定義
// ============================================================

export interface MonthlyActuals {
  month: string; // 'YYYY-MM'
  revenue: number;
  lineRegistrations: number;
  seminarParticipants: number;
  frontendPurchases: number;
  backendPurchases: number;
}

export interface DailyActuals {
  date: string; // 'YYYY-MM-DD'
  revenue: number;
  lineRegistrations: number;
  threadsFollowerDelta: number;
  instagramFollowerDelta: number;
  frontendPurchases: number;
  backendPurchases: number;
}

interface SalesTransaction {
  id: string;
  date: string;
  category: SalesCategoryId | null;
  source: 'univapay' | 'manual';
}

interface GroupedTransaction {
  id: string;
  date: string;
  category: SalesCategoryId | null;
  source: 'univapay' | 'manual' | 'grouped';
}

// ============================================================
// 実績データ取得
// ============================================================

/**
 * 月次の売上実績を取得
 */
async function getMonthlyRevenue(month: string): Promise<number> {
  const client = createBigQueryClient(PROJECT_ID);
  const salesDataset = process.env.SALES_BQ_DATASET ?? 'autostudio_sales';

  const [year, monthNum] = month.split('-').map(Number);
  const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
  const endDate = new Date(year, monthNum, 0).toISOString().split('T')[0]; // 月末日

  try {
    // UnivaPayの課金 + 手動売上
    const [rows] = await client.query({
      query: `
        WITH univa_charges AS (
          SELECT COALESCE(SUM(charged_amount), 0) AS total
          FROM \`${PROJECT_ID}.${salesDataset}.charges\`
          WHERE status = 'successful'
            AND DATE(created_on, 'Asia/Tokyo') BETWEEN @startDate AND @endDate
        ),
        manual_sales AS (
          SELECT COALESCE(SUM(amount), 0) AS total
          FROM \`${PROJECT_ID}.${salesDataset}.manual_sales\`
          WHERE transaction_date BETWEEN @startDate AND @endDate
        )
        SELECT
          (SELECT total FROM univa_charges) + (SELECT total FROM manual_sales) AS total_revenue
      `,
      params: { startDate, endDate },
    });

    const typedRows = rows as Array<{ total_revenue: number }>;
    return Number(typedRows?.[0]?.total_revenue ?? 0);
  } catch (error) {
    console.error('[monthly-actuals] Failed to get revenue:', error);
    return 0;
  }
}

async function loadGroupedTransactions(startDate: string, endDate: string): Promise<GroupedTransaction[]> {
  const client = createBigQueryClient(PROJECT_ID);
  const salesDataset = process.env.SALES_BQ_DATASET ?? 'autostudio_sales';

  const [chargeRows] = await client.query({
    query: `
      SELECT
        id,
        CAST(DATE(created_on, 'Asia/Tokyo') AS STRING) AS date
      FROM \`${PROJECT_ID}.${salesDataset}.charges\`
      WHERE status = 'successful'
        AND DATE(created_on, 'Asia/Tokyo') BETWEEN @startDate AND @endDate
    `,
    params: { startDate, endDate },
  });

  const charges = (chargeRows as Array<{ id: string; date: string }>).map((row) => ({
    id: String(row.id),
    date: String(row.date),
  }));

  const manualSales = await getManualSales(startDate, endDate);
  const categoriesMap = await getChargeCategories(charges.map((charge) => charge.id));
  const groupsMap = await getAllGroups().catch(() => new Map());
  const groupList = Array.from(groupsMap.values()).map(({ group, items }) => ({
    id: group.id,
    items,
  }));

  const transactions: SalesTransaction[] = [
    ...charges.map((charge) => ({
      id: charge.id,
      date: charge.date,
      category: categoriesMap.get(charge.id) ?? null,
      source: 'univapay' as const,
    })),
    ...manualSales.map((sale) => ({
      id: sale.id,
      date: sale.transactionDate,
      category: sale.category ?? null,
      source: 'manual' as const,
    })),
  ];

  const transactionMap = new Map<string, SalesTransaction>();
  for (const tx of transactions) {
    transactionMap.set(`${tx.source}:${tx.id}`, tx);
  }

  const itemToGroup = new Map<string, string>();
  for (const group of groupList) {
    for (const item of group.items) {
      const source = item.itemType === 'charge' ? 'univapay' : 'manual';
      itemToGroup.set(`${source}:${item.itemId}`, group.id);
    }
  }

  const grouped: GroupedTransaction[] = [];
  const processed = new Set<string>();

  for (const tx of transactions) {
    const key = `${tx.source}:${tx.id}`;
    if (processed.has(key)) continue;

    const groupId = itemToGroup.get(key);
    if (groupId) {
      const groupItems = groupList.find((group) => group.id === groupId)?.items ?? [];
      const matched = groupItems
        .map((item: TransactionGroupItem) => {
          const source = item.itemType === 'charge' ? 'univapay' : 'manual';
          return transactionMap.get(`${source}:${item.itemId}`) ?? null;
        })
        .filter(Boolean) as SalesTransaction[];

      if (matched.length > 0) {
        const latestDate = matched.reduce((max, item) => (item.date > max ? item.date : max), matched[0].date);
        const category = matched.find((item) => item.category)?.category ?? null;
        grouped.push({
          id: groupId,
          date: latestDate,
          category,
          source: 'grouped',
        });
        for (const item of matched) {
          processed.add(`${item.source}:${item.id}`);
        }
        continue;
      }
    }

    processed.add(key);
    grouped.push({
      id: tx.id,
      date: tx.date,
      category: tx.category,
      source: tx.source,
    });
  }

  return grouped;
}

export async function getPurchaseCountsByDateRange(
  startDate: string,
  endDate: string,
): Promise<{ frontend: number; backend: number }> {
  const groupedTransactions = await loadGroupedTransactions(startDate, endDate);
  let frontend = 0;
  let backend = 0;

  for (const tx of groupedTransactions) {
    if (tx.category === 'frontend') frontend += 1;
    if (tx.category === 'backend') backend += 1;
  }

  return { frontend, backend };
}

/**
 * 月次のLINE登録数を取得
 */
async function getMonthlyLineRegistrations(month: string): Promise<number> {
  const client = createBigQueryClient(PROJECT_ID, process.env.LSTEP_BQ_LOCATION);
  const datasetId = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';

  const [year, monthNum] = month.split('-').map(Number);
  const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
  const endDate = new Date(year, monthNum, 0).toISOString().split('T')[0];

  try {
    const [rows] = await client.query({
      query: `
        WITH latest AS (
          SELECT MAX(snapshot_date) AS snapshot_date FROM \`${PROJECT_ID}.${datasetId}.user_core\`
        )
        SELECT COUNT(DISTINCT user_id) AS registrations
        FROM \`${PROJECT_ID}.${datasetId}.user_core\`
        WHERE snapshot_date = (SELECT snapshot_date FROM latest)
          AND DATE(TIMESTAMP(friend_added_at), 'Asia/Tokyo') BETWEEN @startDate AND @endDate
      `,
      params: { startDate, endDate },
    });

    const typedRows = rows as Array<{ registrations: number }>;
    return Number(typedRows?.[0]?.registrations ?? 0);
  } catch (error) {
    console.error('[monthly-actuals] Failed to get LINE registrations:', error);
    return 0;
  }
}

/**
 * 月次のセミナー参加数を取得（個別相談申込をセミナーとしてカウント）
 */
async function getMonthlySeminarParticipants(month: string): Promise<number> {
  const client = createBigQueryClient(PROJECT_ID, process.env.LSTEP_BQ_LOCATION);
  const datasetId = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';

  const [year, monthNum] = month.split('-').map(Number);
  const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
  const endDate = new Date(year, monthNum, 0).toISOString().split('T')[0];

  try {
    // th_consultation_applied タグを持つユーザーをカウント
    const [rows] = await client.query({
      query: `
        WITH latest AS (
          SELECT MAX(snapshot_date) AS snapshot_date FROM \`${PROJECT_ID}.${datasetId}.user_core\`
        )
        SELECT COUNT(DISTINCT user_id) AS participants
        FROM \`${PROJECT_ID}.${datasetId}.user_tags\`
        WHERE snapshot_date = (SELECT snapshot_date FROM latest)
          AND tag_name IN ('th_consultation_applied', 'consultation_applied', 'seminar_applied')
          AND tag_added_at IS NOT NULL
          AND DATE(TIMESTAMP(tag_added_at), 'Asia/Tokyo') BETWEEN @startDate AND @endDate
      `,
      params: { startDate, endDate },
    });

    const typedRows = rows as Array<{ participants: number }>;
    return Number(typedRows?.[0]?.participants ?? 0);
  } catch (error) {
    console.error('[monthly-actuals] Failed to get seminar participants:', error);
    return 0;
  }
}

/**
 * 月次の購入数を取得（カテゴリ別）
 */
async function getMonthlyPurchases(month: string): Promise<{ frontend: number; backend: number }> {
  const [year, monthNum] = month.split('-').map(Number);
  const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
  const endDate = new Date(year, monthNum, 0).toISOString().split('T')[0];

  try {
    return await getPurchaseCountsByDateRange(startDate, endDate);
  } catch (error) {
    console.error('[monthly-actuals] Failed to get purchases:', error);
    return { frontend: 0, backend: 0 };
  }
}

/**
 * 月次実績データを取得
 */
export async function getMonthlyActuals(month: string): Promise<MonthlyActuals> {
  const [revenue, lineRegistrations, seminarParticipants, purchases] = await Promise.all([
    getMonthlyRevenue(month),
    getMonthlyLineRegistrations(month),
    getMonthlySeminarParticipants(month),
    getMonthlyPurchases(month),
  ]);

  return {
    month,
    revenue,
    lineRegistrations,
    seminarParticipants,
    frontendPurchases: purchases.frontend,
    backendPurchases: purchases.backend,
  };
}

/**
 * 日別実績データを取得
 */
export async function getDailyActualsByRange(startDate: string, endDate: string): Promise<DailyActuals[]> {
  const client = createBigQueryClient(PROJECT_ID);
  const salesDataset = process.env.SALES_BQ_DATASET ?? 'autostudio_sales';
  const lstepDataset = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';

  // 日付配列を生成
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00`);
  const last = new Date(`${endDate}T00:00:00`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }

  try {
    // 売上（日別）
    const [revenueRows] = await client.query({
      query: `
        WITH dates AS (
          SELECT date FROM UNNEST(GENERATE_DATE_ARRAY(@startDate, @endDate)) AS date
        ),
        univa_daily AS (
          SELECT
            DATE(created_on, 'Asia/Tokyo') AS date,
            SUM(charged_amount) AS amount
          FROM \`${PROJECT_ID}.${salesDataset}.charges\`
          WHERE status = 'successful'
            AND DATE(created_on, 'Asia/Tokyo') BETWEEN @startDate AND @endDate
          GROUP BY date
        ),
        manual_daily AS (
          SELECT
            transaction_date AS date,
            SUM(amount) AS amount
          FROM \`${PROJECT_ID}.${salesDataset}.manual_sales\`
          WHERE transaction_date BETWEEN @startDate AND @endDate
          GROUP BY date
        )
        SELECT
          CAST(d.date AS STRING) AS date,
          COALESCE(u.amount, 0) + COALESCE(m.amount, 0) AS revenue
        FROM dates d
        LEFT JOIN univa_daily u ON d.date = u.date
        LEFT JOIN manual_daily m ON d.date = m.date
        ORDER BY d.date
      `,
      params: { startDate, endDate },
    });

    // LINE登録（日別）
    const lstepClient = createBigQueryClient(PROJECT_ID, process.env.LSTEP_BQ_LOCATION);
    const [lineRows] = await lstepClient.query({
      query: `
        WITH dates AS (
          SELECT date FROM UNNEST(GENERATE_DATE_ARRAY(@startDate, @endDate)) AS date
        ),
        latest AS (
          SELECT MAX(snapshot_date) AS snapshot_date FROM \`${PROJECT_ID}.${lstepDataset}.user_core\`
        ),
        daily_registrations AS (
          SELECT
            DATE(TIMESTAMP(friend_added_at), 'Asia/Tokyo') AS date,
            COUNT(DISTINCT user_id) AS registrations
          FROM \`${PROJECT_ID}.${lstepDataset}.user_core\`
          WHERE snapshot_date = (SELECT snapshot_date FROM latest)
            AND DATE(TIMESTAMP(friend_added_at), 'Asia/Tokyo') BETWEEN @startDate AND @endDate
          GROUP BY date
        )
        SELECT
          CAST(d.date AS STRING) AS date,
          COALESCE(dr.registrations, 0) AS registrations
        FROM dates d
        LEFT JOIN daily_registrations dr ON d.date = dr.date
        ORDER BY d.date
      `,
      params: { startDate, endDate },
    });

    const [threadsInsights, instagramData] = await Promise.all([
      getThreadsInsightsData(),
      getInstagramDashboardData(PROJECT_ID),
    ]);
    const threadsDaily = [...threadsInsights.dailyMetrics].sort((a, b) => a.date.localeCompare(b.date));
    const threadsDeltaMap = new Map<string, number>();
    let previousFollowers: number | null = null;
    for (const metric of threadsDaily) {
      const delta = previousFollowers === null ? 0 : Math.max(0, metric.followers - previousFollowers);
      threadsDeltaMap.set(metric.date, delta);
      previousFollowers = metric.followers;
    }

    const instagramDaily = [...(instagramData.followerSeries ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    const instagramDeltaMap = new Map<string, number>();
    let previousInstagram: number | null = null;
    for (const metric of instagramDaily) {
      const delta = previousInstagram === null ? 0 : Math.max(0, metric.followers - previousInstagram);
      instagramDeltaMap.set(metric.date, delta);
      previousInstagram = metric.followers;
    }

    const groupedTransactions = await loadGroupedTransactions(startDate, endDate);

    // データを結合
    const revenueMap = new Map<string, number>();
    const lineMap = new Map<string, number>();
    const threadsMap = new Map<string, number>();
    const instagramMap = new Map<string, number>();
    const frontendMap = new Map<string, number>();
    const backendMap = new Map<string, number>();

    for (const row of revenueRows as Array<{ date: string; revenue: number }>) {
      revenueMap.set(row.date, Number(row.revenue));
    }
    for (const row of lineRows as Array<{ date: string; registrations: number }>) {
      lineMap.set(row.date, Number(row.registrations));
    }
    for (const date of dates) {
      threadsMap.set(date, threadsDeltaMap.get(date) ?? 0);
      instagramMap.set(date, instagramDeltaMap.get(date) ?? 0);
      frontendMap.set(date, 0);
      backendMap.set(date, 0);
    }
    for (const tx of groupedTransactions) {
      if (!frontendMap.has(tx.date)) continue;
      if (tx.category === 'frontend') {
        frontendMap.set(tx.date, (frontendMap.get(tx.date) ?? 0) + 1);
      }
      if (tx.category === 'backend') {
        backendMap.set(tx.date, (backendMap.get(tx.date) ?? 0) + 1);
      }
    }

    return dates.map((date) => ({
      date,
      revenue: revenueMap.get(date) ?? 0,
      lineRegistrations: lineMap.get(date) ?? 0,
      threadsFollowerDelta: threadsMap.get(date) ?? 0,
      instagramFollowerDelta: instagramMap.get(date) ?? 0,
      frontendPurchases: frontendMap.get(date) ?? 0,
      backendPurchases: backendMap.get(date) ?? 0,
    }));
  } catch (error) {
    console.error('[monthly-actuals] Failed to get daily actuals:', error);
    // 空のデータを返す
    return dates.map((date) => ({
      date,
      revenue: 0,
      lineRegistrations: 0,
      threadsFollowerDelta: 0,
      instagramFollowerDelta: 0,
      frontendPurchases: 0,
      backendPurchases: 0,
    }));
  }
}

export async function getDailyActuals(month: string): Promise<DailyActuals[]> {
  const [year, monthNum] = month.split('-').map(Number);
  const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
  const endDate = new Date(year, monthNum, 0).toISOString().split('T')[0];
  return getDailyActualsByRange(startDate, endDate);
}

export async function getActualsByRange(startDate: string, endDate: string) {
  const daily = await getDailyActualsByRange(startDate, endDate);
  const totals = daily.reduce(
    (acc, d) => ({
      revenue: acc.revenue + d.revenue,
      lineRegistrations: acc.lineRegistrations + d.lineRegistrations,
      threadsFollowerDelta: acc.threadsFollowerDelta + d.threadsFollowerDelta,
      instagramFollowerDelta: acc.instagramFollowerDelta + d.instagramFollowerDelta,
      frontendPurchases: acc.frontendPurchases + d.frontendPurchases,
      backendPurchases: acc.backendPurchases + d.backendPurchases,
    }),
    {
      revenue: 0,
      lineRegistrations: 0,
      threadsFollowerDelta: 0,
      instagramFollowerDelta: 0,
      frontendPurchases: 0,
      backendPurchases: 0,
    },
  );

  return { totals, daily };
}

function findFollowerOnOrBefore(series: Array<{ date: string; followers: number }>, targetDate: string): number | null {
  for (const point of series) {
    if (point.date <= targetDate) {
      return point.followers;
    }
  }
  return null;
}

export async function getTotalsByRange(startDate: string, endDate: string) {
  const client = createBigQueryClient(PROJECT_ID);
  const salesDataset = process.env.SALES_BQ_DATASET ?? 'autostudio_sales';
  const lstepDataset = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';

  const [revenueRows] = await client.query({
    query: `
      WITH univa AS (
        SELECT COALESCE(SUM(charged_amount), 0) AS total
        FROM \`${PROJECT_ID}.${salesDataset}.charges\`
        WHERE status = 'successful'
          AND DATE(created_on, 'Asia/Tokyo') BETWEEN @startDate AND @endDate
      ),
      manual AS (
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM \`${PROJECT_ID}.${salesDataset}.manual_sales\`
        WHERE transaction_date BETWEEN @startDate AND @endDate
      )
      SELECT (SELECT total FROM univa) + (SELECT total FROM manual) AS total_revenue
    `,
    params: { startDate, endDate },
  });
  const revenue = Number((revenueRows as Array<{ total_revenue: number }>)[0]?.total_revenue ?? 0);

  const lstepClient = createBigQueryClient(PROJECT_ID, process.env.LSTEP_BQ_LOCATION);
  const [lineRows] = await lstepClient.query({
    query: `
      WITH latest AS (
        SELECT MAX(snapshot_date) AS snapshot_date FROM \`${PROJECT_ID}.${lstepDataset}.user_core\`
      )
      SELECT COUNT(DISTINCT user_id) AS registrations
      FROM \`${PROJECT_ID}.${lstepDataset}.user_core\`
      WHERE snapshot_date = (SELECT snapshot_date FROM latest)
        AND DATE(TIMESTAMP(friend_added_at), 'Asia/Tokyo') BETWEEN @startDate AND @endDate
    `,
    params: { startDate, endDate },
  });
  const lineRegistrations = Number((lineRows as Array<{ registrations: number }>)[0]?.registrations ?? 0);

  const purchases = await getPurchaseCountsByDateRange(startDate, endDate);

  const [threadsInsights, instagramData] = await Promise.all([
    getThreadsInsightsData(),
    getInstagramDashboardData(PROJECT_ID),
  ]);

  const threadsSeries = [...threadsInsights.dailyMetrics].sort((a, b) => a.date.localeCompare(b.date));
  const instagramSeries = [...(instagramData.followerSeries ?? [])].sort((a, b) => a.date.localeCompare(b.date));

  const threadsStart = findFollowerOnOrBefore(threadsSeries, startDate) ?? threadsSeries[threadsSeries.length - 1]?.followers ?? 0;
  const threadsEnd = findFollowerOnOrBefore(threadsSeries, endDate) ?? threadsSeries[0]?.followers ?? threadsStart;
  const instagramStart = findFollowerOnOrBefore(instagramSeries, startDate) ?? instagramSeries[instagramSeries.length - 1]?.followers ?? 0;
  const instagramEnd = findFollowerOnOrBefore(instagramSeries, endDate) ?? instagramSeries[0]?.followers ?? instagramStart;

  const threadsFollowerDelta = Math.max(0, threadsEnd - threadsStart);
  const instagramFollowerDelta = Math.max(0, instagramEnd - instagramStart);

  return {
    revenue,
    lineRegistrations,
    threadsFollowerDelta,
    instagramFollowerDelta,
    frontendPurchases: purchases.frontend,
    backendPurchases: purchases.backend,
  };
}
