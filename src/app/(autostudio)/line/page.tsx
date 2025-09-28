import { getLineDashboardData } from '@/lib/lstep/dashboard';
import { resolveProjectId } from '@/lib/bigquery';
import { Card } from '@/components/ui/card';

const PROJECT_ID = (() => {
  const preferred = process.env.LSTEP_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID;
  return preferred ? resolveProjectId(preferred) : undefined;
})();

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
      <div className="section-stack">
        <div className="glass-card text-center">
          <h1 className="text-2xl font-semibold text-[color:var(--color-text-primary)]">LINE ダッシュボード</h1>
        </div>
        <div className="ui-banner ui-banner-warning">
          <p className="font-semibold">BigQuery プロジェクト ID が未設定です</p>
          <p className="mt-2">`LSTEP_BQ_PROJECT_ID` もしくは `BQ_PROJECT_ID` を環境変数に設定してください。</p>
        </div>
      </div>
    );
  }

  try {
    const dashboard = await getLineDashboardData(PROJECT_ID);

  if (!dashboard.latestSnapshotDate) {
    return (
      <div className="section-stack">
        <div className="glass-card text-center">
          <h1 className="text-2xl font-semibold text-[color:var(--color-text-primary)]">LINE ダッシュボード</h1>
        </div>
        <div className="ui-empty-state">
          <p>まだ BigQuery にデータが存在しません</p>
          <p className="mt-2 text-xs">Cloud Run / Scheduler のバッチが実行された後に再度確認してください。</p>
        </div>
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
    <div className="section-stack">
      <div className="glass-card text-center">
        <h1 className="text-2xl font-semibold text-[color:var(--color-text-primary)]">LINE ダッシュボード</h1>
        <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
          最終スナップショット: {formatDateLabel(dashboard.latestSnapshotDate)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">日次新規友だち数（直近14日）</h2>
          <dl className="mt-4 space-y-3">
            {dashboard.dailyNewFriends.map((item) => (
              <div key={item.date} className="flex items-center justify-between text-sm">
                <dt className="font-medium text-[color:var(--color-text-secondary)]">{formatDateLabel(item.date)}</dt>
                <dd className="font-semibold text-[color:var(--color-text-primary)]">{formatNumber(item.count)}</dd>
              </div>
            ))}
            {dashboard.dailyNewFriends.length === 0 && (
              <p className="text-sm text-[color:var(--color-text-muted)]">データが見つかりません。</p>
            )}
          </dl>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">タグ別ユーザー数 TOP10</h2>
          <div className="mt-4 space-y-3 text-sm">
            {dashboard.topTags.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-[color:var(--color-text-secondary)]">
                <span className="max-w-[70%] truncate" title={item.name}>
                  {item.name}
                </span>
                <span className="font-semibold text-[color:var(--color-text-primary)]">{formatNumber(item.count)}</span>
              </div>
            ))}
            {dashboard.topTags.length === 0 && (
              <p className="text-sm text-[color:var(--color-text-muted)]">タグデータが見つかりません。</p>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">流入経路別ユーザー数</h2>
          <div className="mt-4 space-y-3 text-sm">
            {dashboard.topSources.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-[color:var(--color-text-secondary)]">
                <span className="max-w-[70%] truncate" title={item.name}>
                  {item.name}
                </span>
                <span className="font-semibold text-[color:var(--color-text-primary)]">{formatNumber(item.count)}</span>
              </div>
            ))}
            {dashboard.topSources.length === 0 && (
              <p className="text-sm text-[color:var(--color-text-muted)]">流入経路データが見つかりません。</p>
            )}
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">ファネル（流入 → 詳細F済 → 成約）</h2>
          <div className="mt-4 space-y-3 text-sm">
            {funnelRows.map((row) => (
              <div key={row.stage} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[color:var(--color-text-primary)]">{row.stage}</span>
                  <span className="font-semibold text-[color:var(--color-text-primary)]">{formatNumber(row.users)}</span>
                </div>
                <div className="mt-2 text-xs text-[color:var(--color-text-muted)]">
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
              <p className="text-sm text-[color:var(--color-text-muted)]">ファネル構成タグが設定されていません。</p>
            )}
          </div>
          <p className="mt-3 text-xs text-[color:var(--color-text-muted)]">
            使用タグは環境変数 `LSTEP_FUNNEL_TAGS`（`|` 区切り）で変更できます。
          </p>
        </Card>
      </div>
    </div>
  );
  } catch (error) {
    console.error('[line/page] Error:', error);
    return (
      <div className="section-stack">
        <div className="glass-card text-center">
          <h1 className="text-2xl font-semibold text-[color:var(--color-text-primary)]">LINE ダッシュボード</h1>
        </div>
        <div className="ui-banner ui-banner-error">
          <p className="font-semibold">エラーが発生しました</p>
          <p className="mt-2">ページの読み込み中にエラーが発生しました。しばらく待ってから再度お試しください。</p>
          <details className="mt-2">
            <summary className="text-xs cursor-pointer">詳細情報</summary>
            <pre className="mt-2 text-xs overflow-auto whitespace-pre-wrap">
              {error instanceof Error ? error.message : String(error)}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
