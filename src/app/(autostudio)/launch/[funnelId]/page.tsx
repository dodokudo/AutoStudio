import { Banner } from '@/components/ui/banner';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { LaunchDetailClient } from './_components/LaunchDetailClient';

const PROJECT_ID = resolveProjectId(
  process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID
);

export const revalidate = 3600;

interface PageProps {
  params: Promise<{ funnelId: string }>;
}

async function fetchFunnelData(funnelId: string) {
  if (!PROJECT_ID) return null;

  const bq = createBigQueryClient(PROJECT_ID);

  // Funnel data is stored as a JSON blob in the `data` column
  const [funnelRows] = await bq.query({
    query: `
      SELECT data, CAST(updated_at AS STRING) as updated_at
      FROM \`mark-454114.marketing.funnels\`
      WHERE id = @id
    `,
    useLegacySql: false,
    params: { id: funnelId },
  });

  if (!funnelRows || funnelRows.length === 0) return null;

  const funnel =
    typeof funnelRows[0].data === 'string'
      ? JSON.parse(funnelRows[0].data)
      : funnelRows[0].data;
  funnel.updatedAt = funnelRows[0].updated_at;

  return funnel;
}

async function fetchBroadcastMetrics() {
  if (!PROJECT_ID) return [];

  const bq = createBigQueryClient(PROJECT_ID);
  const dataset = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';

  try {
    const [rows] = await bq.query({
      query: `
        SELECT
          broadcast_id,
          broadcast_name,
          sent_at,
          delivery_count,
          open_count,
          open_rate,
          elapsed_minutes,
          CAST(measured_at AS STRING) as measured_at
        FROM \`${PROJECT_ID}.${dataset}.broadcast_metrics\`
        ORDER BY broadcast_id, elapsed_minutes
      `,
      useLegacySql: false,
    });
    return rows ?? [];
  } catch {
    // Table might not exist yet
    return [];
  }
}

export default async function LaunchDetailPage({ params }: PageProps) {
  const { funnelId } = await params;

  if (!PROJECT_ID) {
    return (
      <div className="section-stack">
        <Banner variant="warning">
          <p className="font-semibold">BigQuery プロジェクト ID が未設定です</p>
          <p className="mt-2">
            `LSTEP_BQ_PROJECT_ID` もしくは `BQ_PROJECT_ID` を環境変数に設定してください。
          </p>
        </Banner>
      </div>
    );
  }

  try {
    const [funnel, metrics] = await Promise.all([
      fetchFunnelData(funnelId),
      fetchBroadcastMetrics(),
    ]);

    if (!funnel) {
      return (
        <div className="section-stack">
          <Banner variant="error">
            <p className="font-semibold">ファネルが見つかりません</p>
            <p className="mt-2">
              ID: {funnelId} に一致するファネルデータが存在しません。
            </p>
          </Banner>
        </div>
      );
    }

    return (
      <LaunchDetailClient
        funnel={funnel}
        broadcastMetrics={metrics}
      />
    );
  } catch (error) {
    console.error('[launch/detail] Error:', error);
    return (
      <div className="section-stack">
        <Banner variant="error">
          <p className="font-semibold">エラーが発生しました</p>
          <p className="mt-2">データの読み込み中にエラーが発生しました。</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-xs">詳細情報</summary>
            <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">
              {error instanceof Error ? error.message : String(error)}
            </pre>
          </details>
        </Banner>
      </div>
    );
  }
}
