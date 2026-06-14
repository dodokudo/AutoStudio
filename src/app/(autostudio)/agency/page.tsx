import { getAgencyStats, type AgencyStats } from '@/lib/agency';

export const dynamic = 'force-dynamic';

export default async function AgencyPage() {
  let stats: AgencyStats | null = null;
  let loadError = false;

  try {
    stats = await getAgencyStats();
  } catch (error) {
    console.error('[agency/page] Error:', error);
    loadError = true;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[color:var(--color-text-primary)]">代理店</h1>
        <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
          2026-06-14以降にLINE登録した友だちの、流入元（友だち情報）別の登録数・アンケート回答・セミナー申し込み・購入
          {stats?.updatedAt ? ` ｜ データ更新日: ${stats.updatedAt}` : ''}
        </p>
      </div>

      {loadError ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6 text-sm text-[color:var(--color-text-secondary)]">
          データの読み込みに失敗しました。時間をおいて再度お試しください。
        </div>
      ) : !stats || stats.summary.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6 text-sm text-[color:var(--color-text-secondary)]">
          まだ流入元が記録された友だちがいません。Lステップの友だち情報「流入元」に値が入ると、ここに集計が表示されます。
        </div>
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-lg font-semibold text-[color:var(--color-text-primary)]">ランキング（累計）</h2>
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-text-secondary)]">
                    <th className="px-4 py-3">順位</th>
                    <th className="px-4 py-3">流入元</th>
                    <th className="px-4 py-3 text-right">登録数</th>
                    <th className="px-4 py-3 text-right">アンケート回答</th>
                    <th className="px-4 py-3 text-right">セミナー申し込み</th>
                    <th className="px-4 py-3 text-right">購入</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.summary.map((row, index) => (
                    <tr key={row.agency} className="border-b border-[color:var(--color-border)] last:border-b-0">
                      <td className="px-4 py-3 font-semibold">{index + 1}</td>
                      <td className="px-4 py-3 font-medium text-[color:var(--color-text-primary)]">{row.agency}</td>
                      <td className="px-4 py-3 text-right">{row.registrations}</td>
                      <td className="px-4 py-3 text-right">{row.surveyResponses}</td>
                      <td className="px-4 py-3 text-right">{row.seminarApplications}</td>
                      <td className="px-4 py-3 text-right">{row.purchases}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-semibold text-[color:var(--color-text-primary)]">日別内訳</h2>
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-text-secondary)]">
                    <th className="px-4 py-3">登録日</th>
                    <th className="px-4 py-3">流入元</th>
                    <th className="px-4 py-3 text-right">登録数</th>
                    <th className="px-4 py-3 text-right">アンケート回答</th>
                    <th className="px-4 py-3 text-right">セミナー申し込み</th>
                    <th className="px-4 py-3 text-right">購入</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.daily.map((row, index) => (
                    <tr key={`${row.date}-${row.agency}-${index}`} className="border-b border-[color:var(--color-border)] last:border-b-0">
                      <td className="px-4 py-3">{row.date ?? '不明'}</td>
                      <td className="px-4 py-3 font-medium text-[color:var(--color-text-primary)]">{row.agency}</td>
                      <td className="px-4 py-3 text-right">{row.registrations}</td>
                      <td className="px-4 py-3 text-right">{row.surveyResponses}</td>
                      <td className="px-4 py-3 text-right">{row.seminarApplications}</td>
                      <td className="px-4 py-3 text-right">{row.purchases}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
