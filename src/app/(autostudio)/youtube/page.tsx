import { resolveProjectId } from '@/lib/bigquery';
import { getYoutubeDashboardData } from '@/lib/youtube/dashboard';
import {
  createYoutubeBigQueryContext,
  ensureYoutubeTables,
  listContentScripts,
  type StoredContentScript,
} from '@/lib/youtube/bigquery';
import { ScriptGenerateButton } from '@/components/youtube/ScriptGenerateButton';

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
      <div className="space-y-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold text-white">YouTube ダッシュボード</h1>
          {data.overview.latestSnapshotDate ? (
            <p className="text-xs text-slate-400">最新スナップショット: {String(data.overview.latestSnapshotDate)}</p>
          ) : (
            <p className="text-xs text-slate-400">まだデータが取り込まれていません。</p>
          )}
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          {overviewCards.map((card) => (
            <div key={card.label} className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold text-white">{card.value}</p>
            </div>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-base font-semibold text-white">自チャンネル指標</h2>
            <p className="mt-1 text-xs text-slate-400">自チャンネルのパフォーマンス（直近30日 / 7日）</p>
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
              <table className="w-full table-auto text-left text-xs text-slate-300">
                <thead className="bg-slate-900/80 text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">指標</th>
                    <th className="px-3 py-2 font-medium">直近30日</th>
                    <th className="px-3 py-2 font-medium">直近7日</th>
                  </tr>
                </thead>
                <tbody>
                  {ownMetricsRows.map((row) => (
                    <tr key={row.label} className="border-t border-slate-800 last:border-b">
                      <td className="px-3 py-2 font-medium text-white">{row.label}</td>
                      <td className="px-3 py-2">{row.value30}</td>
                      <td className="px-3 py-2">{row.value7}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-base font-semibold text-white">競合チャンネルの動向</h2>
            <p className="mt-1 text-xs text-slate-400">最新スナップショットから伸びているチャンネルを抽出。</p>
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
              {competitorRows.length === 0 ? (
                <div className="p-6 text-center text-sm text-slate-400">競合チャンネルのデータがありません。</div>
              ) : (
                <table className="w-full table-auto text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/80 text-slate-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">チャンネル</th>
                      <th className="px-3 py-2 font-medium">登録者</th>
                      <th className="px-3 py-2 font-medium">平均伸び速度</th>
                      <th className="px-3 py-2 font-medium">平均ER</th>
                      <th className="px-3 py-2 font-medium">最新動画</th>
                      <th className="px-3 py-2 font-medium">投稿日</th>
                    </tr>
                  </thead>
                  <tbody>
                    {competitorRows.map((row) => (
                      <tr key={row.channel} className="border-t border-slate-800 last:border-b">
                        <td className="px-3 py-2 font-medium text-white">{row.channel}</td>
                        <td className="px-3 py-2">{row.subscribers}</td>
                        <td className="px-3 py-2">{row.viewVelocity}</td>
                        <td className="px-3 py-2">{row.engagement}</td>
                        <td className="px-3 py-2">{row.latestVideo}</td>
                        <td className="px-3 py-2">{row.latestPublishedAt}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </section>

        {comparison && (
          <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-base font-semibold text-white">自分 vs 競合</h2>
            <p className="mt-1 text-xs text-slate-400">最新スナップショットでの平均値比較</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">伸び速度 / 日</p>
                <div className="mt-3 flex items-baseline gap-3 text-sm">
                  <div className="flex-1">
                    <p className="text-[11px] text-slate-400">自チャンネル</p>
                    <p className="text-xl font-semibold text-white">
                      {comparison.ownViewVelocity ? formatNumber(Math.round(comparison.ownViewVelocity)) : '–'}
                    </p>
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-[11px] text-slate-400">競合平均</p>
                    <p className="text-xl font-semibold text-indigo-300">
                      {comparison.competitorViewVelocity
                        ? formatNumber(Math.round(comparison.competitorViewVelocity))
                        : '–'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">エンゲージメント率</p>
                <div className="mt-3 flex items-baseline gap-3 text-sm">
                  <div className="flex-1">
                    <p className="text-[11px] text-slate-400">自チャンネル</p>
                    <p className="text-xl font-semibold text-white">
                      {formatPercentage(comparison.ownEngagementRate)}
                    </p>
                  </div>
                  <div className="flex-1 text-right">
                    <p className="text-[11px] text-slate-400">競合平均</p>
                    <p className="text-xl font-semibold text-indigo-300">
                      {formatPercentage(comparison.competitorEngagementRate)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-slate-500">競合平均は同日のスナップショットから算出しています。</p>
          </section>
        )}

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-base font-semibold text-white">ホットテーマ候補</h2>
            <p className="mt-1 text-xs text-slate-400">上位動画のタグとタイトルから抽出したキーワードをスコア順に表示。</p>
            <div className="mt-4 space-y-4">
              {data.themes.length === 0 && <p className="text-sm text-slate-400">まだ十分な動画データがありません。</p>}
              {data.themes.map((theme) => (
                <div key={theme.keyword} className="rounded-md border border-slate-800 bg-slate-900/70 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-white">{theme.keyword}</p>
                      <p className="text-xs text-slate-400">スコア: {formatNumber(Math.round(theme.score))}</p>
                    </div>
                    <ScriptGenerateButton
                      themeKeyword={theme.keyword}
                      representativeVideo={theme.representativeVideos[0]}
                    />
                  </div>
                  <ul className="mt-3 space-y-2 text-xs text-slate-300">
                    {theme.representativeVideos.slice(0, 3).map((video) => (
                      <li key={video.videoId} className="truncate">
                        <span className="font-medium text-slate-200">{video.channelTitle ?? video.channelId}</span>
                        <span className="mx-1 text-slate-500">/</span>
                        <span>{video.title}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-base font-semibold text-white">トップ動画 (最新スナップショット)</h2>
            <div className="mt-4 space-y-3 text-xs text-slate-300">
              {data.topVideos.slice(0, 8).map((video) => (
                <div key={video.videoId} className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
                  <p className="truncate text-sm font-semibold text-white" title={video.title}>
                    {video.title}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className="text-slate-400">{video.channelTitle ?? video.channelId}</span>
                    <span className="text-slate-400">
                      再生: {video.viewCount ? formatNumber(video.viewCount) : '–'}
                    </span>
                    <span className="text-slate-400">
                      伸び速度: {video.viewVelocity ? formatNumber(Math.round(video.viewVelocity)) : '–'} /日
                    </span>
                    <span className="text-slate-400">ER: {formatPercentage(video.engagementRate)}
                    </span>
                  </div>
                </div>
              ))}
              {data.topVideos.length === 0 && <p className="text-sm text-slate-400">動画データが未取得です。</p>}
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">テーマ別詳細</h2>
            <p className="text-xs text-slate-400">各テーマを選んで台本生成を開始する準備。</p>
          </div>
          <table className="mt-4 w-full table-auto text-left text-xs text-slate-300">
            <thead className="text-slate-400">
              <tr className="border-b border-slate-800">
                <th className="py-2 pr-3 font-medium">キーワード</th>
                <th className="py-2 pr-3 font-medium">代表動画</th>
                <th className="py-2 pr-3 font-medium">再生数</th>
                <th className="py-2 pr-3 font-medium">伸び速度</th>
                <th className="py-2 pr-3 font-medium">ER</th>
                <th className="py-2 pr-3 font-medium">アクション</th>
              </tr>
            </thead>
            <tbody>
              {data.themes.map((theme) => (
                <tr key={`${theme.keyword}-table`} className="border-b border-slate-800/60 last:border-none">
                  <td className="py-2 pr-3 font-semibold text-white">{theme.keyword}</td>
                  <td className="py-2 pr-3">
                    {theme.representativeVideos.slice(0, 1).map((video) => (
                      <div key={video.videoId} className="truncate" title={video.title}>
                        {video.title}
                      </div>
                    ))}
                  </td>
                  <td className="py-2 pr-3">
                    {theme.representativeVideos[0]?.viewCount
                      ? formatNumber(theme.representativeVideos[0].viewCount!)
                      : '–'}
                  </td>
                  <td className="py-2 pr-3">
                    {theme.representativeVideos[0]?.viewVelocity
                      ? formatNumber(Math.round(theme.representativeVideos[0].viewVelocity!))
                      : '–'}
                  </td>
                  <td className="py-2 pr-3">{formatPercentage(theme.representativeVideos[0]?.engagementRate)}</td>
                  <td className="py-2 pr-3">
                    <ScriptGenerateButton themeKeyword={theme.keyword} representativeVideo={theme.representativeVideos[0]} />
                  </td>
                </tr>
              ))}
              {data.themes.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-400">
                    キーワード分析結果がまだありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
          <h2 className="text-base font-semibold text-white">生成済み台本</h2>
          <p className="mt-1 text-xs text-slate-400">最新の台本ドラフトとステータスを一覧表示します。</p>
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
            {scripts.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-400">まだ生成済み台本がありません。</div>
            ) : (
              <table className="w-full table-auto text-left text-xs text-slate-300">
                <thead className="bg-slate-900/80 text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">タイトル</th>
                    <th className="px-3 py-2 font-medium">テーマ</th>
                    <th className="px-3 py-2 font-medium">ステータス</th>
                    <th className="px-3 py-2 font-medium">更新日</th>
                    <th className="px-3 py-2 font-medium">Notion</th>
                  </tr>
                </thead>
                <tbody>
                  {scripts.map((script) => {
                    const notionUrl = buildNotionUrl(script.notionPageId);
                    return (
                      <tr key={script.contentId} className="border-t border-slate-800 last:border-b">
                        <td className="px-3 py-2 font-medium text-white">{script.title ?? script.contentId}</td>
                        <td className="px-3 py-2">{script.themeKeyword ?? '未設定'}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-1 text-[11px] text-slate-200">
                            {script.status ?? 'draft'}
                          </span>
                        </td>
                        <td className="px-3 py-2">{formatDateTime(script.updatedAt)}</td>
                        <td className="px-3 py-2">
                          {notionUrl ? (
                            <a
                              href={notionUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-200 hover:border-slate-500 hover:text-white"
                            >
                              Notionを開く
                            </a>
                          ) : (
                            <span className="text-slate-500">未連携</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    );
  } catch (error) {
    console.error('[youtube/page] error', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-white">YouTube ダッシュボード</h1>
        <div className="rounded-md border border-red-500/40 bg-red-950/60 p-6">
          <p className="text-sm font-medium text-red-200">データの取得に失敗しました。</p>
          <p className="mt-2 text-xs text-red-300">環境変数や BigQuery の設定を確認してください。</p>
          {process.env.NODE_ENV === 'development' && (
            <details className="mt-4">
              <summary className="text-xs text-red-400 cursor-pointer">エラー詳細 (開発環境のみ)</summary>
              <pre className="mt-2 text-xs text-red-300 whitespace-pre-wrap">{errorMessage}</pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}
