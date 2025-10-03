import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const projectId = resolveProjectId(process.env.NEXT_PUBLIC_GCP_PROJECT_ID);
const dataset = 'autostudio_links';

export interface LinkClicksByDate {
  date: string;
  clicks: number;
}

export async function getThreadsLinkClicks(): Promise<LinkClicksByDate[]> {
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
      DATE(cl.clicked_at) as date,
      COUNT(*) as clicks
    FROM \`${projectId}.${dataset}.click_logs\` cl
    INNER JOIN latest_links ll ON cl.short_link_id = ll.id
    WHERE ll.rn = 1
    GROUP BY date
    ORDER BY date DESC
  `;

  const [rows] = await bigquery.query({ query });

  return rows.map((row: Record<string, unknown>) => ({
    date: String(row.date),
    clicks: parseInt(String(row.clicks)),
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
