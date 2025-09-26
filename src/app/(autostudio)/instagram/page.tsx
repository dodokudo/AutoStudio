import { ensureInstagramTables } from '@/lib/instagram/bigquery';
import { createInstagramBigQuery, loadInstagramConfig } from '@/lib/instagram';

export const dynamic = 'force-dynamic';

export default async function InstagramDashboardPage() {
  try {
    const config = loadInstagramConfig();
    const bigquery = createInstagramBigQuery();
    await ensureInstagramTables(bigquery);

    return (
      <div className="space-y-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold text-white">Instagram ダッシュボード</h1>
          <p className="text-xs text-slate-400">
            競合リールの自動リサーチと台本生成の結果を確認できます。現在は基盤のセットアップ直後のため、まずは日次バッチを実行してください。
          </p>
        </header>

        <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-base font-semibold text-white">進捗チェックリスト</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-200">
            <li>Google Drive に競合リールが保存されていることを確認</li>
            <li>`npm run ig:fetch` で BigQuery にメタ情報を投入</li>
            <li>`npm run ig:transcribe` で Gemini 文字起こしを実行</li>
            <li>`npm run ig:generate` で Claude 台本生成を実行</li>
            <li>`npm run ig:notify` でメール通知を送信</li>
          </ol>
          <p className="text-xs text-slate-500">
            すべてのステップが完了すると、このページに競合トレンドと今日の台本が表示されます。
          </p>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-base font-semibold text-white">環境情報</h2>
          <div className="mt-3 space-y-1 text-xs text-slate-300">
            <p>BigQuery: <span className="text-slate-100">{`${config.projectId}.${config.dataset}`}</span></p>
            <p>Drive フォルダ: <span className="text-slate-100">{config.driveFolderIds.join(', ')}</span></p>
            <p>Claude モデル: <span className="text-slate-100">{config.claudeModel}</span></p>
          </div>
        </section>
      </div>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-white">Instagram ダッシュボード</h1>
        <div className="rounded-md border border-amber-400/40 bg-amber-500/10 p-6 text-sm text-amber-200">
          <p className="font-semibold text-amber-100">環境変数が不足しています</p>
          <p className="mt-2 text-amber-200/80">{message}</p>
          <p className="mt-4 text-xs text-amber-200/70">`.env.local` に Instagram ツールの環境変数を設定した後、ページを再読み込みしてください。</p>
        </div>
      </div>
    );
  }
}
