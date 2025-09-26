import { getYoutubeDashboardData } from '@/lib/youtube/dashboard';

function formatNumber(value: number, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat('ja-JP', options).format(value);
}

function formatPercentage(value: number | undefined) {
  if (value === undefined || Number.isNaN(value)) return '–';
  return `${(value * 100).toFixed(1)}%`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '–';
  const minutes = Math.floor(seconds / 60);
  const sec = Math.round(seconds % 60);
  return `${minutes}分${sec.toString().padStart(2, '0')}秒`;
}

export const dynamic = 'force-dynamic';

export default async function YoutubeDashboardPage() {
  try {
    const data = await getYoutubeDashboardData();

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

    return (
      <div className="space-y-10">
        <header className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold text-white">YouTube ダッシュボード</h1>
          {data.overview.latestSnapshotDate ? (
            <p className="text-xs text-slate-400">最新スナップショット: {data.overview.latestSnapshotDate}</p>
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
            <h2 className="text-base font-semibold text-white">ホットテーマ候補</h2>
            <p className="mt-1 text-xs text-slate-400">上位動画のタグとタイトルから抽出したキーワードをスコア順に表示。</p>
            <div className="mt-4 space-y-4">
              {data.themes.length === 0 && <p className="text-sm text-slate-400">まだ十分な動画データがありません。</p>}
              {data.themes.map((theme) => (
                <div key={theme.keyword} className="rounded-md border border-slate-800 bg-slate-900/70 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-white">{theme.keyword}</p>
                      <p className="text-xs text-slate-400">スコア: {formatNumber(Math.round(theme.score))}</p>
                    </div>
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
                    <span className="text-slate-400">ER: {formatPercentage(video.engagementRate)}</span>
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
                  <td className="py-2 pr-3">
                    {formatPercentage(theme.representativeVideos[0]?.engagementRate)}
                  </td>
                </tr>
              ))}
              {data.themes.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-400">
                    キーワード分析結果がまだありません。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    );
  } catch (error) {
    console.error('[youtube/page] error', error);
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-semibold text-white">YouTube ダッシュボード</h1>
        <div className="rounded-md border border-red-500/40 bg-red-950/60 p-6">
          <p className="text-sm font-medium text-red-200">データの取得に失敗しました。</p>
          <p className="mt-2 text-xs text-red-300">環境変数や BigQuery の設定を確認してください。</p>
        </div>
      </div>
    );
  }
}
