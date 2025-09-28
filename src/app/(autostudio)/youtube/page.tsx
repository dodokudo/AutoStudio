import { resolveProjectId } from '@/lib/bigquery';
import { getYoutubeDashboardData } from '@/lib/youtube/dashboard';
import {
  createYoutubeBigQueryContext,
  ensureYoutubeTables,
  listContentScripts,
  type StoredContentScript,
} from '@/lib/youtube/bigquery';
import { ScriptGenerateButton } from '@/components/youtube/ScriptGenerateButton';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function formatNumber(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat('ja-JP', options).format(value);
}

function formatPercentage(value: number | null | undefined) {
  if (value === undefined || value === null || Number.isNaN(value)) return '–';
  return `${(value * 100).toFixed(1)}%`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '–';
  const minutes = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${minutes}分${sec.toString().padStart(2, '0')}秒`;
}

function buildNotionUrl(pageId?: string) {
  if (!pageId) return undefined;
  const compact = pageId.replace(/-/g, '');
  return `https://www.notion.so/${compact}`;
}

function formatDateTime(value?: string) {
  if (!value) return '–';
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export const dynamic = 'force-dynamic';

export default async function YoutubeDashboardPage() {
  try {
    const data = await getYoutubeDashboardData();

    const projectId = resolveProjectId();
    const datasetId = process.env.YOUTUBE_BQ_DATASET_ID ?? 'autostudio_media';
    const context = createYoutubeBigQueryContext(projectId, datasetId);
    await ensureYoutubeTables(context);
    const scripts: StoredContentScript[] = await listContentScripts(context, { limit: 12 });

    const overviewCards = [
      {
        label: '直近30日視聴回数',
        value: formatNumber(Math.round(data.overview.totalViews30d)),
      },
      {
        label: '平均視聴時間',
        value: formatDuration(data.overview.avgViewDuration),
      },
      {
        label: '登録者純増 (30日)',
        value: formatNumber(Math.round(data.overview.subscriberDelta30d)),
      },
    ];

    const own30 = data.analytics.own.last30Days;
    const own7 = data.analytics.own.last7Days;
    const comparison = data.analytics.comparison;

    const ownMetricsRows = [
      {
        label: '視聴回数',
        value30: `${formatNumber(own30.views)} 回`,
        value7: `${formatNumber(own7.views)} 回`,
      },
      {
        label: '視聴時間',
        value30: `${formatNumber(own30.watchTimeMinutes)} 分`,
        value7: `${formatNumber(own7.watchTimeMinutes)} 分`,
      },
      {
        label: '平均視聴持続',
        value30: formatDuration(own30.averageViewDurationSeconds),
        value7: formatDuration(own7.averageViewDurationSeconds),
      },
      {
        label: '登録者純増',
        value30: `${own30.subscriberNet >= 0 ? '+' : ''}${formatNumber(own30.subscriberNet)}`,
        value7: `${own7.subscriberNet >= 0 ? '+' : ''}${formatNumber(own7.subscriberNet)}`,
      },
    ];

    const competitorRows = data.competitors.map((competitor) => ({
      channel: competitor.channelTitle,
      subscribers: competitor.subscriberCount ? `${formatNumber(competitor.subscriberCount)} 人` : '–',
      viewVelocity: competitor.avgViewVelocity ? `${formatNumber(Math.round(competitor.avgViewVelocity))} /日` : '–',
      engagement: formatPercentage(competitor.avgEngagementRate),
      latestVideo:
        competitor.latestVideoTitle
          ? `${competitor.latestVideoTitle} (${competitor.latestVideoViewCount ? formatNumber(competitor.latestVideoViewCount) : '–'}回)`
          : '–',
      latestPublishedAt: competitor.latestVideoPublishedAt ? formatDateTime(competitor.latestVideoPublishedAt) : '–',
    }));

    return (
      <div className="section-stack">
        <div className="glass-card text-center">
          <h1 className="text-2xl font-semibold text-[color:var(--color-text-primary)]">YouTube ダッシュボード</h1>
          {data.overview.latestSnapshotDate ? (
            <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">最新スナップショット: {String(data.overview.latestSnapshotDate)}</p>
          ) : (
            <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">まだデータが取り込まれていません。</p>
          )}
        </div>

        <Card>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)] mb-4">概要</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {overviewCards.map((card) => (
              <div key={card.label} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-secondary)]">{card.label}</p>
                <p className="mt-3 text-2xl font-semibold text-[color:var(--color-text-primary)]">{card.value}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">自チャンネル指標</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">自チャンネルのパフォーマンス（直近30日 / 7日）</p>
            <div className="mt-4 overflow-hidden ui-table">
              <table className="w-full">
                <thead>
                  <tr>
                    <th>指標</th>
                    <th>直近30日</th>
                    <th>直近7日</th>
                  </tr>
                </thead>
                <tbody>
                  {ownMetricsRows.map((row) => (
                    <tr key={row.label}>
                      <td className="font-medium text-[color:var(--color-text-primary)]">{row.label}</td>
                      <td>{row.value30}</td>
                      <td>{row.value7}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">競合チャンネルの動向</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">最新スナップショットから伸びているチャンネルを抽出</p>
            <div className="mt-4">
              {competitorRows.length === 0 ? (
                <div className="ui-empty-state">
                  <p>競合チャンネルのデータがありません</p>
                </div>
              ) : (
                <div className="overflow-hidden ui-table">
                  <table className="w-full">
                    <thead>
                      <tr>
                        <th>チャンネル</th>
                        <th>登録者</th>
                        <th>平均伸び速度</th>
                        <th>平均ER</th>
                        <th>最新動画</th>
                        <th>投稿日</th>
                      </tr>
                    </thead>
                    <tbody>
                      {competitorRows.map((row) => (
                        <tr key={row.channel}>
                          <td className="font-medium text-[color:var(--color-text-primary)]">{row.channel}</td>
                          <td>{row.subscribers}</td>
                          <td>{row.viewVelocity}</td>
                          <td>{row.engagement}</td>
                          <td>{row.latestVideo}</td>
                          <td>{row.latestPublishedAt}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        </div>

        {comparison && (
          <Card>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">自分 vs 競合</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">最新スナップショットでの平均値比較</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-secondary)]">伸び速度 / 日</p>
                <div className="mt-3 flex items-baseline gap-3 text-sm">
                  <div className="flex-1">
                    <p className="text-[11px] text-[color:var(--color-text-muted)]">自チャンネル</p>
                    <p className="text-xl font-semibold text-[color:var(--color-text-primary)]">
                      {comparison.ownViewVelocity ? formatNumber(Math.round(comparison.ownViewVelocity)) : '–'}
                    </p>
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-[11px] text-[color:var(--color-text-muted)]">競合平均</p>
                    <p className="text-xl font-semibold text-[color:var(--color-accent)]">
                      {comparison.competitorViewVelocity
                        ? formatNumber(Math.round(comparison.competitorViewVelocity))
                        : '–'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-text-secondary)]">エンゲージメント率</p>
                <div className="mt-3 flex items-baseline gap-3 text-sm">
                  <div className="flex-1">
                    <p className="text-[11px] text-[color:var(--color-text-muted)]">自チャンネル</p>
                    <p className="text-xl font-semibold text-[color:var(--color-text-primary)]">
                      {formatPercentage(comparison.ownEngagementRate)}
                    </p>
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-[11px] text-[color:var(--color-text-muted)]">競合平均</p>
                    <p className="text-xl font-semibold text-[color:var(--color-accent)]">
                      {formatPercentage(comparison.competitorEngagementRate)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-xs text-[color:var(--color-text-muted)]">競合平均は同日のスナップショットから算出しています。</p>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">ホットテーマ候補</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">上位動画のタグとタイトルから抽出したキーワードをスコア順に表示</p>
            <div className="mt-4 space-y-4">
              {data.themes.length === 0 && <p className="text-sm text-[color:var(--color-text-muted)]">まだ十分な動画データがありません。</p>}
              {data.themes.map((theme) => (
                <div key={theme.keyword} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">{theme.keyword}</p>
                      <p className="text-xs text-[color:var(--color-text-muted)]">スコア: {formatNumber(Math.round(theme.score))}</p>
                    </div>
                    <ScriptGenerateButton
                      themeKeyword={theme.keyword}
                      representativeVideo={theme.representativeVideos[0]}
                    />
                  </div>
                  <ul className="mt-3 space-y-2 text-xs text-[color:var(--color-text-secondary)]">
                    {theme.representativeVideos.slice(0, 3).map((video) => (
                      <li key={video.videoId} className="truncate">
                        <span className="font-medium text-[color:var(--color-text-primary)]">{video.channelTitle ?? video.channelId}</span>
                        <span className="mx-1 text-[color:var(--color-text-muted)]">/</span>
                        <span>{video.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">トップ動画 (最新スナップショット)</h2>
            <div className="mt-4 space-y-3 text-sm">
              {data.topVideos.slice(0, 8).map((video) => (
                <div key={video.videoId} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3">
                  <p className="truncate text-sm font-semibold text-[color:var(--color-text-primary)]" title={video.title}>
                    {video.title}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-text-secondary)]">
                    <span>{video.channelTitle ?? video.channelId}</span>
                    <span>
                      再生: {video.viewCount ? formatNumber(video.viewCount) : '–'}
                    </span>
                    <span>
                      伸び速度: {video.viewVelocity ? formatNumber(Math.round(video.viewVelocity)) : '–'} /日
                    </span>
                    <span>ER: {formatPercentage(video.engagementRate)}
                    </span>
                  </div>
                </div>
              ))}
              {data.topVideos.length === 0 && <p className="text-sm text-[color:var(--color-text-muted)]">動画データが未取得です。</p>}
            </div>
          </Card>
        </div>

        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">テーマ別詳細</h2>
            <p className="text-sm text-[color:var(--color-text-secondary)]">各テーマを選んで台本生成を開始する準備。</p>
          </div>
          <div className="mt-4 overflow-hidden ui-table">
            <table className="w-full">
              <thead>
                <tr>
                  <th>キーワード</th>
                  <th>代表動画</th>
                  <th>再生数</th>
                  <th>伸び速度</th>
                  <th>ER</th>
                  <th>アクション</th>
                </tr>
              </thead>
              <tbody>
                {data.themes.map((theme) => (
                  <tr key={`${theme.keyword}-table`}>
                    <td className="font-medium text-[color:var(--color-text-primary)]">{theme.keyword}</td>
                    <td>
                      {theme.representativeVideos.slice(0, 1).map((video) => (
                        <div key={video.videoId} className="truncate" title={video.title}>
                          {video.title}
                        </div>
                      ))}
                    </td>
                    <td>
                      {theme.representativeVideos[0]?.viewCount
                        ? formatNumber(theme.representativeVideos[0].viewCount!)
                        : '–'}
                    </td>
                    <td>
                      {theme.representativeVideos[0]?.viewVelocity
                        ? formatNumber(Math.round(theme.representativeVideos[0].viewVelocity!))
                        : '–'}
                    </td>
                    <td>{formatPercentage(theme.representativeVideos[0]?.engagementRate)}</td>
                    <td>
                      <ScriptGenerateButton themeKeyword={theme.keyword} representativeVideo={theme.representativeVideos[0]} />
                    </td>
                  </tr>
                ))}
                {data.themes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-4 text-center text-[color:var(--color-text-muted)]">
                      キーワード分析結果がまだありません。
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">生成済み台本</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">最新の台本ドラフトとステータスを一覧表示します。</p>
          <div className="mt-4">
            {scripts.length === 0 ? (
              <div className="ui-empty-state">
                <p>まだ生成済み台本がありません。</p>
              </div>
            ) : (
              <div className="overflow-hidden ui-table">
                <table className="w-full">
                  <thead>
                    <tr>
                      <th>タイトル</th>
                      <th>テーマ</th>
                      <th>ステータス</th>
                      <th>更新日</th>
                      <th>Notion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scripts.map((script) => {
                      const notionUrl = buildNotionUrl(script.notionPageId);
                      return (
                        <tr key={script.contentId}>
                          <td className="font-medium text-[color:var(--color-text-primary)]">{script.title ?? script.contentId}</td>
                          <td>{script.themeKeyword ?? '未設定'}</td>
                          <td>
                            <span className="inline-flex items-center rounded-full bg-[color:var(--color-surface-muted)] px-2 py-1 text-[11px] text-[color:var(--color-text-secondary)]">
                              {script.status ?? 'draft'}
                            </span>
                          </td>
                          <td>{formatDateTime(script.updatedAt)}</td>
                          <td>
                            {notionUrl ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => window.open(notionUrl, '_blank')}
                              >
                                Notionを開く
                              </Button>
                            ) : (
                              <span className="text-[color:var(--color-text-muted)]">未連携</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  } catch (error) {
    console.error('[youtube/page] error', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return (
      <div className="section-stack">
        <div className="glass-card text-center">
          <h1 className="text-2xl font-semibold text-[color:var(--color-text-primary)]">YouTube ダッシュボード</h1>
        </div>
        <div className="ui-banner ui-banner-error">
          <p className="font-semibold">データの取得に失敗しました</p>
          <p className="mt-2">環境変数や BigQuery の設定を確認してください。</p>
          {process.env.NODE_ENV === 'development' && (
            <details className="mt-4">
              <summary className="text-xs cursor-pointer">エラー詳細 (開発環境のみ)</summary>
              <pre className="mt-2 text-xs whitespace-pre-wrap">{errorMessage}</pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
