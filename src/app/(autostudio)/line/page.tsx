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

    return (
      <div className="section-stack">
        {/* ヘッダー */}
        <Card>
          <h1 className="text-2xl font-semibold text-[color:var(--color-text-primary)]">LINE登録者分析</h1>
          <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
            最終更新: {formatDateLabel(analytics.latestSnapshotDate)}
          </p>
        </Card>

        {/* 日別登録数テーブル */}
        <Card>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)] mb-4">📅 日別登録数</h2>
          <DailyRegistrationsTable data={analytics.dailyRegistrations} />
        </Card>

        {/* ファネル分析 */}
        <Card>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)] mb-4">📈 ファネル分析</h2>
          <div className="flex flex-col md:flex-row items-center justify-center gap-0">
            {/* LINE登録 */}
            <div className="flex-1 text-center max-w-[280px]">
              <div className="bg-[color:var(--color-surface)] border-2 border-[color:var(--color-accent)] rounded-[var(--radius-md)] p-8 shadow-[var(--shadow-soft)]">
                <div className="text-sm text-[color:var(--color-text-secondary)] font-medium mb-3">LINE登録</div>
                <div className="text-4xl font-bold text-[color:var(--color-text-primary)]">
                  {formatNumber(analytics.funnel.lineRegistration)}人
                </div>
              </div>
            </div>

            {/* CVR矢印1 */}
            <div className="flex flex-col items-center gap-1 px-4 py-2 md:py-0">
              <span className="text-2xl">→</span>
              <span
                className={`text-xs font-semibold ${analytics.funnel.surveyEnteredCVR >= 50 ? 'text-[color:var(--color-success)]' : 'text-[color:var(--color-warning)]'}`}
              >
                CVR: {formatPercent(analytics.funnel.surveyEnteredCVR)}
              </span>
              <span className="text-xs text-[color:var(--color-text-muted)]">
                ({formatNumber(analytics.funnel.surveyEntered)}人)
              </span>
            </div>

            {/* アンケート流入 */}
            <div className="flex-1 text-center max-w-[280px]">
              <div className="bg-[color:var(--color-surface)] border-2 border-[color:var(--color-accent)] rounded-[var(--radius-md)] p-8 shadow-[var(--shadow-soft)]">
                <div className="text-sm text-[color:var(--color-text-secondary)] font-medium mb-3">アンケート流入</div>
                <div className="text-4xl font-bold text-[color:var(--color-text-primary)]">
                  {formatNumber(analytics.funnel.surveyEntered)}人
                </div>
              </div>
            </div>

            {/* CVR矢印2 */}
            <div className="flex flex-col items-center gap-1 px-4 py-2 md:py-0">
              <span className="text-2xl">→</span>
              <span
                className={`text-xs font-semibold ${analytics.funnel.surveyCompletedCVR >= 70 ? 'text-[color:var(--color-success)]' : 'text-[color:var(--color-warning)]'}`}
              >
                CVR: {formatPercent(analytics.funnel.surveyCompletedCVR)}
              </span>
              <span className="text-xs text-[color:var(--color-text-muted)]">
                ({formatNumber(analytics.funnel.surveyCompleted)}人)
              </span>
            </div>

            {/* アンケート完了 */}
            <div className="flex-1 text-center max-w-[280px]">
              <div className="bg-[color:var(--color-surface)] border-2 border-[color:var(--color-accent)] rounded-[var(--radius-md)] p-8 shadow-[var(--shadow-soft)]">
                <div className="text-sm text-[color:var(--color-text-secondary)] font-medium mb-3">アンケート完了</div>
                <div className="text-4xl font-bold text-[color:var(--color-text-primary)]">
                  {formatNumber(analytics.funnel.surveyCompleted)}人
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* 流入経路分析 */}
        <Card>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)] mb-4">📱 流入経路分析</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-[var(--radius-md)] p-5 text-center shadow-[var(--shadow-soft)]">
              <h3 className="text-sm text-[color:var(--color-text-secondary)] font-medium mb-3">Threads</h3>
              <div className="text-3xl font-bold text-[color:var(--color-text-primary)] mb-1">
                {formatNumber(analytics.sources.threads)}
              </div>
              <div className="text-sm text-[color:var(--color-text-muted)]">
                {formatPercent(analytics.sources.threadsPercent)}
              </div>
            </div>

            <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-[var(--radius-md)] p-5 text-center shadow-[var(--shadow-soft)]">
              <h3 className="text-sm text-[color:var(--color-text-secondary)] font-medium mb-3">Instagram</h3>
              <div className="text-3xl font-bold text-[color:var(--color-text-primary)] mb-1">
                {formatNumber(analytics.sources.instagram)}
              </div>
              <div className="text-sm text-[color:var(--color-text-muted)]">
                {formatPercent(analytics.sources.instagramPercent)}
              </div>
            </div>

            <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-[var(--radius-md)] p-5 text-center shadow-[var(--shadow-soft)]">
              <h3 className="text-sm text-[color:var(--color-text-secondary)] font-medium mb-3">YouTube</h3>
              <div className="text-3xl font-bold text-[color:var(--color-text-primary)] mb-1">
                {formatNumber(analytics.sources.youtube)}
              </div>
              <div className="text-sm text-[color:var(--color-text-muted)]">
                {formatPercent(analytics.sources.youtubePercent)}
              </div>
            </div>

            <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-[var(--radius-md)] p-5 text-center shadow-[var(--shadow-soft)]">
              <h3 className="text-sm text-[color:var(--color-text-secondary)] font-medium mb-3">その他</h3>
              <div className="text-3xl font-bold text-[color:var(--color-text-primary)] mb-1">
                {formatNumber(analytics.sources.other)}
              </div>
              <div className="text-sm text-[color:var(--color-text-muted)]">
                {formatPercent(analytics.sources.otherPercent)}
              </div>
            </div>

            <div className="bg-[color:var(--color-surface)] border border-[color:var(--color-border)] rounded-[var(--radius-md)] p-5 text-center shadow-[var(--shadow-soft)]">
              <h3 className="text-sm text-[color:var(--color-text-secondary)] font-medium mb-3">オーガニック</h3>
              <div className="text-3xl font-bold text-[color:var(--color-text-primary)] mb-1">
                {formatNumber(analytics.sources.organic)}
              </div>
              <div className="text-sm text-[color:var(--color-text-muted)]">
                {formatPercent(analytics.sources.organicPercent)}
              </div>
            </div>
          </div>
        </Card>

        {/* 属性分析 */}
        <Card>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)] mb-4">👥 属性分析</h2>

          {/* 年齢層 */}
          <div className="mb-8">
            <h3 className="text-base font-semibold text-[color:var(--color-text-primary)] mb-3">年齢層</h3>
            <div className="space-y-3">
              {analytics.attributes.age.map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="w-24 text-sm text-[color:var(--color-text-secondary)] font-medium">{item.label}</div>
                  <div className="flex-1 h-8 bg-[color:var(--color-surface-muted)] rounded-[var(--radius-sm)] overflow-hidden">
                    <div
                      className="h-full bg-[color:var(--color-accent)] transition-all duration-300"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                  <div className="min-w-[100px] text-right text-sm text-[color:var(--color-text-secondary)]">
                    {formatNumber(item.count)}人 ({formatPercent(item.percent)})
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 職業 */}
          <div className="mb-8">
            <h3 className="text-base font-semibold text-[color:var(--color-text-primary)] mb-3">職業</h3>
            <div className="space-y-3">
              {analytics.attributes.job.map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="w-24 text-sm text-[color:var(--color-text-secondary)] font-medium">{item.label}</div>
                  <div className="flex-1 h-8 bg-[color:var(--color-surface-muted)] rounded-[var(--radius-sm)] overflow-hidden">
                    <div
                      className="h-full bg-[color:var(--color-accent)] transition-all duration-300"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                  <div className="min-w-[100px] text-right text-sm text-[color:var(--color-text-secondary)]">
                    {formatNumber(item.count)}人 ({formatPercent(item.percent)})
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 現在の売上 */}
          <div className="mb-8">
            <h3 className="text-base font-semibold text-[color:var(--color-text-primary)] mb-3">現在の売上（月商）</h3>
            <div className="space-y-3">
              {analytics.attributes.currentRevenue.map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="w-24 text-sm text-[color:var(--color-text-secondary)] font-medium">{item.label}</div>
                  <div className="flex-1 h-8 bg-[color:var(--color-surface-muted)] rounded-[var(--radius-sm)] overflow-hidden">
                    <div
                      className="h-full bg-[color:var(--color-accent)] transition-all duration-300"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                  <div className="min-w-[100px] text-right text-sm text-[color:var(--color-text-secondary)]">
                    {formatNumber(item.count)}人 ({formatPercent(item.percent)})
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 目標売上 */}
          <div>
            <h3 className="text-base font-semibold text-[color:var(--color-text-primary)] mb-3">目標売上（月商）</h3>
            <div className="space-y-3">
              {analytics.attributes.goalRevenue.map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <div className="w-24 text-sm text-[color:var(--color-text-secondary)] font-medium">{item.label}</div>
                  <div className="flex-1 h-8 bg-[color:var(--color-surface-muted)] rounded-[var(--radius-sm)] overflow-hidden">
                    <div
                      className="h-full bg-[color:var(--color-accent)] transition-all duration-300"
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                  <div className="min-w-[100px] text-right text-sm text-[color:var(--color-text-secondary)]">
                    {formatNumber(item.count)}人 ({formatPercent(item.percent)})
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    );
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
