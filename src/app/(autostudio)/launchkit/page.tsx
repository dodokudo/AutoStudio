import Link from 'next/link';
import { listLPs, getLPMetrics, getMetricsByGenre, getMetricsBySource } from '@/lib/launchkit/bigquery';

export const dynamic = 'force-dynamic';

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export default async function LaunchkitPage() {
  const now = new Date();
  const startDate = formatDate(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
  const endDate = formatDate(now);

  const [lps, lpMetrics, genreMetrics, sourceMetrics] = await Promise.all([
    listLPs(true),
    getLPMetrics(startDate, endDate),
    getMetricsByGenre(startDate, endDate),
    getMetricsBySource(startDate, endDate),
  ]);

  const metricsByLpId = new Map(lpMetrics.map((m) => [m.lpId, m]));

  return (
    <div className="space-y-6 p-6">
      <header className="flex items-center justify-end">
        <Link
          href="/launchkit/new"
          className="rounded-md bg-[color:var(--color-text-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + 新規LP登録
        </Link>
      </header>

      <p className="text-xs text-gray-500">集計期間: {startDate} 〜 {endDate}（過去30日）</p>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">ジャンル別</h2>
          <table className="w-full text-xs">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-1">ジャンル</th>
                <th className="py-1 text-right">閲覧</th>
                <th className="py-1 text-right">CTA</th>
                <th className="py-1 text-right">CTA率</th>
              </tr>
            </thead>
            <tbody>
              {genreMetrics.length === 0 && (
                <tr><td colSpan={4} className="py-2 text-center text-gray-400">データなし</td></tr>
              )}
              {genreMetrics.map((g) => (
                <tr key={g.genre} className="border-t">
                  <td className="py-1">{g.genre}</td>
                  <td className="py-1 text-right">{g.pageViews.toLocaleString()}</td>
                  <td className="py-1 text-right">{g.ctaClicks.toLocaleString()}</td>
                  <td className="py-1 text-right">{g.ctaRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">流入元別</h2>
          <table className="w-full text-xs">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-1">流入元</th>
                <th className="py-1 text-right">閲覧</th>
                <th className="py-1 text-right">CTA</th>
                <th className="py-1 text-right">CTA率</th>
              </tr>
            </thead>
            <tbody>
              {sourceMetrics.length === 0 && (
                <tr><td colSpan={4} className="py-2 text-center text-gray-400">データなし</td></tr>
              )}
              {sourceMetrics.map((s) => (
                <tr key={s.source} className="border-t">
                  <td className="py-1">{s.source}</td>
                  <td className="py-1 text-right">{s.pageViews.toLocaleString()}</td>
                  <td className="py-1 text-right">{s.ctaClicks.toLocaleString()}</td>
                  <td className="py-1 text-right">{s.ctaRate.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded border border-gray-200 bg-white">
        <h2 className="border-b px-4 py-3 text-sm font-semibold text-gray-700">LP一覧</h2>
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-2">名前</th>
              <th className="px-4 py-2">slug</th>
              <th className="px-4 py-2">ジャンル</th>
              <th className="px-4 py-2">流入元</th>
              <th className="px-4 py-2">状態</th>
              <th className="px-4 py-2 text-right">閲覧</th>
              <th className="px-4 py-2 text-right">CTA</th>
              <th className="px-4 py-2 text-right">CTA率</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lps.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-4 text-center text-gray-400">LPがありません</td></tr>
            )}
            {lps.map((lp) => {
              const m = metricsByLpId.get(lp.id);
              return (
                <tr key={lp.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{lp.name}</td>
                  <td className="px-4 py-2 text-gray-600">{lp.slug}</td>
                  <td className="px-4 py-2">{lp.genre ?? '-'}</td>
                  <td className="px-4 py-2">{lp.source ?? '-'}</td>
                  <td className="px-4 py-2">
                    {lp.isActive ? (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-green-700">有効</span>
                    ) : (
                      <span className="rounded bg-gray-200 px-2 py-0.5 text-gray-600">無効</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">{m?.pageViews.toLocaleString() ?? '0'}</td>
                  <td className="px-4 py-2 text-right">{m?.ctaClicks.toLocaleString() ?? '0'}</td>
                  <td className="px-4 py-2 text-right">{(m?.ctaRate ?? 0).toFixed(1)}%</td>
                  <td className="px-4 py-2">
                    <Link href={`/launchkit/${lp.id}`} className="text-blue-600 hover:underline">編集</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
