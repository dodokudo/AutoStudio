import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const DEFAULT_DATASET = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';

function resolveProject() {
  const candidate =
    process.env.LSTEP_BQ_PROJECT_ID
    ?? process.env.BQ_PROJECT_ID
    ?? process.env.NEXT_PUBLIC_GCP_PROJECT_ID
    ?? process.env.GCP_PROJECT_ID
    ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (!candidate) {
    throw new Error('LSTEP用のProject IDが設定されていません');
  }
  return resolveProjectId(candidate);
}

export async function listLineSources(): Promise<string[]> {
  const projectId = resolveProject();
  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);

  const [rows] = await client.query({
    query: `
      SELECT DISTINCT source_name
      FROM \`${projectId}.${DEFAULT_DATASET}.user_sources\`
      WHERE source_name IS NOT NULL
        AND source_name != ''
      ORDER BY source_name
    `,
  });

  return (rows as Array<{ source_name: string | null }>).map((row) => row.source_name ?? '').filter((value) => value.length > 0);
}
