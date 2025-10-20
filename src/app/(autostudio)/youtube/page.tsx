import { resolveProjectId } from '@/lib/bigquery';
import { getYoutubeDashboardData } from '@/lib/youtube/dashboard';
import {
  createYoutubeBigQueryContext,
  ensureYoutubeTables,
  listContentScripts,
  type StoredContentScript,
} from '@/lib/youtube/bigquery';
import { Banner } from '@/components/ui/banner';
import { YoutubeDashboardShell } from './_components/YoutubeDashboardShell';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow up to 60 seconds for BigQuery queries

export default async function YoutubeDashboardPage() {
  try {
    const data = await getYoutubeDashboardData();

    const projectId = resolveProjectId();
    const datasetId = process.env.YOUTUBE_BQ_DATASET_ID ?? 'autostudio_media';
    const context = createYoutubeBigQueryContext(projectId, datasetId);
    await ensureYoutubeTables(context);
    const scripts: StoredContentScript[] = await listContentScripts(context, { limit: 12 });

    return (
      <div className="section-stack">
        <YoutubeDashboardShell
          overview={data.overview}
          overviewSeries={data.overviewSeries}
          analytics={data.analytics}
          topVideos={data.topVideos}
          competitors={data.competitors}
          scripts={scripts}
          lineRegistrationCount={data.lineRegistrationCount}
        />
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <div className="section-stack">
        <Banner variant="error">
          <p className="font-semibold">YouTube ダッシュボードの読み込みに失敗しました</p>
          <p className="mt-1 text-sm">{message}</p>
          <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">環境変数や BigQuery テーブル設定を確認してください。</p>
        </Banner>
      </div>
    );
  }
}
