import { getLstepAnalytics } from '@/lib/lstep/analytics';
import { resolveProjectId } from '@/lib/bigquery';
import { Banner } from '@/components/ui/banner';
import { EmptyState } from '@/components/ui/empty-state';
import { LineDashboardClient } from './_components/LineDashboardClient';

const PROJECT_ID = (() => {
  const preferred = process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID;
  return preferred ? resolveProjectId(preferred) : undefined;
})();

export const dynamic = 'force-dynamic';

export default async function LineDashboardPage() {
  if (!PROJECT_ID) {
    return (
      <div className="section-stack">
        <Banner variant="warning">
          <p className="font-semibold">BigQuery プロジェクト ID が未設定です</p>
          <p className="mt-2">`LSTEP_BQ_PROJECT_ID` もしくは `BQ_PROJECT_ID` を環境変数に設定してください。</p>
        </Banner>
      </div>
    );
  }

  try {
    const analytics = await getLstepAnalytics(PROJECT_ID);

    if (!analytics.latestSnapshotDate) {
      return (
        <div className="section-stack">
          <EmptyState
            title="まだ BigQuery にデータが存在しません"
            description="Cloud Run / Scheduler のバッチが実行された後に再度確認してください。"
          />
        </div>
      );
    }

    return <LineDashboardClient initialData={analytics} />;
  } catch (error) {
    console.error('[line/page] Error:', error);
    return (
      <div className="section-stack">
        <Banner variant="error">
          <p className="font-semibold">エラーが発生しました</p>
          <p className="mt-2">ページの読み込み中にエラーが発生しました。しばらく待ってから再度お試しください。</p>
          <details className="mt-2">
            <summary className="text-xs cursor-pointer">詳細情報</summary>
            <pre className="mt-2 text-xs overflow-auto whitespace-pre-wrap">
              {error instanceof Error ? error.message : String(error)}
            </pre>
          </details>
        </Banner>
      </div>
    );
  }
}
