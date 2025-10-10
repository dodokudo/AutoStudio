import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const projectId = resolveProjectId(process.env.NEXT_PUBLIC_GCP_PROJECT_ID);
const dataset = 'autostudio_links';

export interface LinkClicksByDate {
  date: string;
  clicks: number;
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
