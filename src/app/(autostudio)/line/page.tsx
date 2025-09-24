import { getLineDashboardData } from '@/lib/lstep/dashboard';

const PROJECT_ID = process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID;

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value);
}

function formatDateLabel(value: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

export const dynamic = 'force-dynamic';

export default async function LineDashboardPage() {
  if (!PROJECT_ID) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-white">LINE ダッシュボード</h1>
        <p className="text-sm text-slate-300">
          BigQuery プロジェクト ID が未設定です。`LSTEP_BQ_PROJECT_ID` もしくは `BQ_PROJECT_ID` を環境変数に設定してください。
        </p>
      </div>
    );
  }

  try {
    const dashboard = await getLineDashboardData(PROJECT_ID);

  if (!dashboard.latestSnapshotDate) {
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-white">LINE ダッシュボード</h1>
        <p className="text-sm text-slate-300">
          まだ BigQuery にデータが存在しません。Cloud Run / Scheduler のバッチが実行された後に再度確認してください。
        </p>
      </div>
    );
  }

  const funnelRows = dashboard.funnel.map((stage, index) => {
    const first = dashboard.funnel[0];
    const prev = index > 0 ? dashboard.funnel[index - 1] : null;
    const toStart = first && first.users > 0 ? stage.users / first.users : null;
    const toPrev = prev && prev.users > 0 ? stage.users / prev.users : null;

    return {
      stage: stage.stage,
      users: stage.users,
      toStart,
      toPrev,
    };
  });

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-white">LINE ダッシュボード</h1>
        <p className="text-xs text-slate-400">
          最終スナップショット: {formatDateLabel(dashboard.latestSnapshotDate)}
        </p>
      </header>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-base font-semibold text-white">日次新規友だち数（直近14日）</h2>
          <dl className="mt-4 space-y-3">
            {dashboard.dailyNewFriends.map((item) => (
              <div key={item.date} className="flex items-center justify-between text-sm text-slate-200">
                <dt className="font-medium text-slate-300">{formatDateLabel(item.date)}</dt>
                <dd className="font-semibold text-white">{formatNumber(item.count)}</dd>
              </div>
            ))}
            {dashboard.dailyNewFriends.length === 0 && (
              <p className="text-sm text-slate-400">データが見つかりません。</p>
            )}
          </dl>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-base font-semibold text-white">タグ別ユーザー数 TOP10</h2>
          <div className="mt-4 space-y-3 text-sm">
            {dashboard.topTags.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-slate-200">
                <span className="max-w-[70%] truncate" title={item.name}>
                  {item.name}
                </span>
                <span className="font-semibold text-white">{formatNumber(item.count)}</span>
              </div>
            ))}
            {dashboard.topTags.length === 0 && (
              <p className="text-sm text-slate-400">タグデータが見つかりません。</p>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-base font-semibold text-white">流入経路別ユーザー数</h2>
          <div className="mt-4 space-y-3 text-sm">
            {dashboard.topSources.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-slate-200">
                <span className="max-w-[70%] truncate" title={item.name}>
                  {item.name}
                </span>
                <span className="font-semibold text-white">{formatNumber(item.count)}</span>
              </div>
            ))}
            {dashboard.topSources.length === 0 && (
              <p className="text-sm text-slate-400">流入経路データが見つかりません。</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-base font-semibold text-white">ファネル（流入 → 詳細F済 → 成約）</h2>
          <div className="mt-4 space-y-3 text-sm text-slate-200">
            {funnelRows.map((row) => (
              <div key={row.stage} className="rounded-md border border-slate-800 bg-slate-900/80 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-white">{row.stage}</span>
                  <span className="font-semibold text-white">{formatNumber(row.users)}</span>
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  {row.toPrev !== null && row.toPrev !== undefined ? (
                    <p>前段階比: {(row.toPrev * 100).toFixed(1)}%</p>
                  ) : (
                    <p>ファネル起点</p>
                  )}
                  {row.toStart !== null && row.toStart !== undefined && row.toPrev !== null ? (
                    <p>起点比: {(row.toStart * 100).toFixed(1)}%</p>
                  ) : null}
                </div>
              </div>
            ))}
            {funnelRows.length === 0 && (
              <p className="text-sm text-slate-400">ファネル構成タグが設定されていません。</p>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            使用タグは環境変数 `LSTEP_FUNNEL_TAGS`（`|` 区切り）で変更できます。
          </p>
        </div>
      </section>
    </div>
  );
  } catch (error) {
    console.error('[line/page] Error:', error);
    return (
      <div className="space-y-6 p-8">
        <h1 className="text-xl font-semibold text-white">LINE ダッシュボード</h1>
        <div className="rounded-md bg-red-50 p-4 border border-red-200">
          <h3 className="text-sm font-medium text-red-800">エラーが発生しました</h3>
          <div className="mt-2 text-sm text-red-700">
            <p>ページの読み込み中にエラーが発生しました。しばらく待ってから再度お試しください。</p>
            <details className="mt-2">
              <summary className="cursor-pointer">詳細情報</summary>
              <pre className="mt-2 text-xs overflow-auto">
                {error instanceof Error ? error.message : String(error)}
              </pre>
            </details>
          </div>
        </div>
      </div>
    );
  }
}
