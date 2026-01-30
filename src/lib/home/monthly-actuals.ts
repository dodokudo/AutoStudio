/**
 * 月次実績データ取得
 */
import { createBigQueryClient, resolveProjectId } from '../bigquery';

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
  frontendPurchases: number;
  backendPurchases: number;
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
  const client = createBigQueryClient(PROJECT_ID);
  const salesDataset = process.env.SALES_BQ_DATASET ?? 'autostudio_sales';

  const [year, monthNum] = month.split('-').map(Number);
  const startDate = `${year}-${String(monthNum).padStart(2, '0')}-01`;
  const endDate = new Date(year, monthNum, 0).toISOString().split('T')[0];

  try {
    // UnivaPayの課金をカテゴリでカウント
    const [rows] = await client.query({
      query: `
        WITH univa_purchases AS (
          SELECT
            cc.category,
            COUNT(*) AS count
          FROM \`${PROJECT_ID}.${salesDataset}.charges\` c
          INNER JOIN \`${PROJECT_ID}.${salesDataset}.charge_categories\` cc ON c.id = cc.charge_id
          WHERE c.status = 'successful'
            AND DATE(c.created_on, 'Asia/Tokyo') BETWEEN @startDate AND @endDate
            AND cc.category IN ('frontend', 'backend')
          GROUP BY cc.category
        ),
        manual_purchases AS (
          SELECT
            category,
            COUNT(*) AS count
          FROM \`${PROJECT_ID}.${salesDataset}.manual_sales\`
          WHERE transaction_date BETWEEN @startDate AND @endDate
            AND category IN ('frontend', 'backend')
          GROUP BY category
        ),
        combined AS (
          SELECT category, count FROM univa_purchases
          UNION ALL
          SELECT category, count FROM manual_purchases
        )
        SELECT
          category,
          SUM(count) AS total
        FROM combined
        GROUP BY category
      `,
      params: { startDate, endDate },
    });

    const typedRows = rows as Array<{ category: string; total: number }>;
    let frontend = 0;
    let backend = 0;

    for (const row of typedRows) {
      if (row.category === 'frontend') frontend = Number(row.total);
      if (row.category === 'backend') backend = Number(row.total);
    }

    return { frontend, backend };
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
export async function getDailyActuals(month: string): Promise<DailyActuals[]> {
  const client = createBigQueryClient(PROJECT_ID);
  const salesDataset = process.env.SALES_BQ_DATASET ?? 'autostudio_sales';
  const lstepDataset = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';

  const [year, monthNum] = month.split('-').map(Number);
  const daysInMonth = new Date(year, monthNum, 0).getDate();

  // 日付配列を生成
  const dates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dates.push(`${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

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

    // 購入（日別）
    const [purchaseRows] = await client.query({
      query: `
        WITH dates AS (
          SELECT date FROM UNNEST(GENERATE_DATE_ARRAY(@startDate, @endDate)) AS date
        ),
        univa_purchases AS (
          SELECT
            DATE(c.created_on, 'Asia/Tokyo') AS date,
            cc.category,
            COUNT(*) AS count
          FROM \`${PROJECT_ID}.${salesDataset}.charges\` c
          INNER JOIN \`${PROJECT_ID}.${salesDataset}.charge_categories\` cc ON c.id = cc.charge_id
          WHERE c.status = 'successful'
            AND DATE(c.created_on, 'Asia/Tokyo') BETWEEN @startDate AND @endDate
            AND cc.category IN ('frontend', 'backend')
          GROUP BY date, category
        ),
        manual_purchases AS (
          SELECT
            transaction_date AS date,
            category,
            COUNT(*) AS count
          FROM \`${PROJECT_ID}.${salesDataset}.manual_sales\`
          WHERE transaction_date BETWEEN @startDate AND @endDate
            AND category IN ('frontend', 'backend')
          GROUP BY date, category
        ),
        combined AS (
          SELECT date, category, count FROM univa_purchases
          UNION ALL
          SELECT date, category, count FROM manual_purchases
        ),
        daily_purchases AS (
          SELECT
            date,
            SUM(CASE WHEN category = 'frontend' THEN count ELSE 0 END) AS frontend,
            SUM(CASE WHEN category = 'backend' THEN count ELSE 0 END) AS backend
          FROM combined
          GROUP BY date
        )
        SELECT
          CAST(d.date AS STRING) AS date,
          COALESCE(dp.frontend, 0) AS frontend,
          COALESCE(dp.backend, 0) AS backend
        FROM dates d
        LEFT JOIN daily_purchases dp ON d.date = dp.date
        ORDER BY d.date
      `,
      params: { startDate, endDate },
    });

    // データを結合
    const revenueMap = new Map<string, number>();
    const lineMap = new Map<string, number>();
    const frontendMap = new Map<string, number>();
    const backendMap = new Map<string, number>();

    for (const row of revenueRows as Array<{ date: string; revenue: number }>) {
      revenueMap.set(row.date, Number(row.revenue));
    }
    for (const row of lineRows as Array<{ date: string; registrations: number }>) {
      lineMap.set(row.date, Number(row.registrations));
    }
    for (const row of purchaseRows as Array<{ date: string; frontend: number; backend: number }>) {
      frontendMap.set(row.date, Number(row.frontend));
      backendMap.set(row.date, Number(row.backend));
    }

    return dates.map((date) => ({
      date,
      revenue: revenueMap.get(date) ?? 0,
      lineRegistrations: lineMap.get(date) ?? 0,
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
      frontendPurchases: 0,
      backendPurchases: 0,
    }));
  }
}
