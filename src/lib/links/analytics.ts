import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { formatDateInput } from '@/lib/dateRangePresets';

const projectId = resolveProjectId(process.env.NEXT_PUBLIC_GCP_PROJECT_ID);
const dataset = 'autostudio_links';

export interface LinkClicksByDate {
  date: string;
  clicks: number;
}

export interface LinkClicksSummary {
  total: number;
  byCategory: Array<{
    category: string;
    clicks: number;
  }>;
}

// Threads導線LPに配置されているLINE登録ボタンのshort_code一覧。
// LaunchKit /content/opt-3, opt-4, threads-opt* に埋め込まれているリンクを手動で列挙。
// LP側でCTAを増やした際はここに追記する。
export const THREADS_LP_LINE_SHORT_CODES = [
  'L-opt4',
  'L-opt4-tp',
  'L-opt4-th',
  'L-opt4-ig',
  'TAI2',
  'TAI2kp',
  'TAI2p',
  'IG-TAI2',
  'thLINE1',
  'prf_LN',
  'kpost_LN',
  'IG_LN2',
] as const;

export async function getThreadsLpLineClicksByRange(start: Date, end: Date): Promise<LinkClicksByDate[]> {
  const bigquery = createBigQueryClient(projectId);
  const startKey = formatDateInput(start);
  const endKey = formatDateInput(end);

  const query = `
    WITH latest_links AS (
      SELECT
        id,
        short_code,
        ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at DESC) AS rn
      FROM \`${projectId}.${dataset}.short_links\`
      WHERE is_active = TRUE
        AND short_code IN UNNEST(@codes)
    )
    SELECT
      FORMAT_DATE('%Y-%m-%d', DATE(TIMESTAMP(cl.clicked_at), "Asia/Tokyo")) AS date,
      COUNT(*) AS clicks
    FROM \`${projectId}.${dataset}.click_logs\` cl
    JOIN latest_links ll ON cl.short_link_id = ll.id
    WHERE ll.rn = 1
      AND DATE(TIMESTAMP(cl.clicked_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate
    GROUP BY date
    ORDER BY date DESC
  `;

  const [rows] = await bigquery.query({
    query,
    params: {
      codes: [...THREADS_LP_LINE_SHORT_CODES],
      startDate: startKey,
      endDate: endKey,
    },
  });

  return rows.map((row: Record<string, unknown>) => ({
    date: String(row.date),
    clicks: Number(row.clicks ?? 0),
  }));
}

export async function getThreadsLpLineClicksTotal(start: Date, end: Date): Promise<number> {
  const series = await getThreadsLpLineClicksByRange(start, end);
  return series.reduce((sum, entry) => sum + entry.clicks, 0);
}

export async function getThreadsLinkClicks(): Promise<LinkClicksByDate[]> {
  const end = new Date();
  const start = new Date(end.getTime());
  start.setDate(start.getDate() - 29);
  return getThreadsLinkClicksByRange(start, end);
}

export async function getThreadsLinkClicksByRange(start: Date, end: Date): Promise<LinkClicksByDate[]> {
  const bigquery = createBigQueryClient(projectId);

  const query = `
    WITH latest_links AS (
      SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at DESC) as rn
      FROM \`${projectId}.${dataset}.short_links\`
      WHERE is_active = true
        AND category = 'threads'
    )
    SELECT
      FORMAT_DATE('%Y-%m-%d', DATE(cl.clicked_at)) as date,
      COUNT(*) as clicks
    FROM \`${projectId}.${dataset}.click_logs\` cl
    INNER JOIN latest_links ll ON cl.short_link_id = ll.id
    WHERE ll.rn = 1
      AND DATE(cl.clicked_at) BETWEEN @startDate AND @endDate
    GROUP BY FORMAT_DATE('%Y-%m-%d', DATE(cl.clicked_at))
    ORDER BY date DESC
  `;

  const [rows] = await bigquery.query({
    query,
    params: {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    },
  });

  return rows.map((row: Record<string, unknown>) => ({
    date: String(row.date),
    clicks: Number(row.clicks ?? 0),
  }));
}

export async function getTotalThreadsClicks(): Promise<number> {
  const bigquery = createBigQueryClient(projectId);

  const query = `
    WITH latest_links AS (
      SELECT
        id,
        short_code,
        category,
        ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at DESC) as rn
      FROM \`${projectId}.${dataset}.short_links\`
      WHERE is_active = true
      AND category = 'threads'
    )
    SELECT
      COUNT(*) as total_clicks
    FROM \`${projectId}.${dataset}.click_logs\` cl
    INNER JOIN latest_links ll ON cl.short_link_id = ll.id
    WHERE ll.rn = 1
  `;

  const [rows] = await bigquery.query({ query });
  const result = rows[0] as Record<string, unknown>;

  return parseInt(String(result?.total_clicks || 0));
}

export async function getLinkClicksSummary({
  startDate,
  endDate,
}: {
  startDate: Date;
  endDate: Date;
}): Promise<LinkClicksSummary> {
  const bigquery = createBigQueryClient(projectId);
  const startKey = formatDateInput(startDate);
  const endKey = formatDateInput(endDate);

  const query = `
    WITH latest_links AS (
      SELECT
        id,
        category,
        ROW_NUMBER() OVER (PARTITION BY id ORDER BY created_at DESC) AS rn
      FROM \`${projectId}.${dataset}.short_links\`
      WHERE is_active = TRUE
    ),
    filtered_clicks AS (
      SELECT
        cl.short_link_id,
        DATE(TIMESTAMP(cl.clicked_at), "Asia/Tokyo") AS clicked_date
      FROM \`${projectId}.${dataset}.click_logs\` cl
      WHERE DATE(TIMESTAMP(cl.clicked_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate
    )
    SELECT
      COALESCE(ll.category, 'unknown') AS category,
      COUNT(*) AS clicks
    FROM filtered_clicks fc
    JOIN latest_links ll ON fc.short_link_id = ll.id
    WHERE ll.rn = 1
    GROUP BY category
  `;

  const [rows] = await bigquery.query({
    query,
    params: {
      startDate: startKey,
      endDate: endKey,
    },
  });

  const byCategory = rows.map((row: Record<string, unknown>) => ({
    category: String(row.category ?? 'unknown'),
    clicks: Number(row.clicks ?? 0),
  }));

  const total = byCategory.reduce((sum, entry) => sum + entry.clicks, 0);

  return {
    total,
    byCategory,
  };
}
