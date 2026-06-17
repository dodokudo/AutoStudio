import { getAgencyStats, type AgencyStats } from '@/lib/agency';
import { UNIFIED_RANGE_OPTIONS, formatDateInput, isUnifiedRangePreset, resolveDateRange, type UnifiedRangePreset } from '@/lib/dateRangePresets';
import { InsightsRangeSelector } from '../threads/_components/insights-range-selector';

export const dynamic = 'force-dynamic';

const RANGE_SELECT_OPTIONS = UNIFIED_RANGE_OPTIONS.map((option) =>
  option.value === '1d' ? { ...option, label: '今日' } : option,
);

function formatRate(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0.0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

export default async function AgencyPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[]>>;
}) {
  const resolvedSearchParams = await searchParams;
  const rangeParam = typeof resolvedSearchParams?.range === 'string' ? resolvedSearchParams.range : undefined;
  const startParam = typeof resolvedSearchParams?.start === 'string' ? resolvedSearchParams.start : undefined;
  const endParam = typeof resolvedSearchParams?.end === 'string' ? resolvedSearchParams.end : undefined;
  const selectedRangeValue: UnifiedRangePreset = isUnifiedRangePreset(rangeParam) ? rangeParam : 'all';
  const resolvedRange = resolveDateRange(selectedRangeValue, startParam, endParam, { includeToday: true });
  const rangeValueForUi = resolvedRange.preset;
  const customStart = rangeValueForUi === 'custom' ? formatDateInput(resolvedRange.start) : startParam;
  const customEnd = rangeValueForUi === 'custom' ? formatDateInput(resolvedRange.end) : endParam;
  const rangeStart = formatDateInput(resolvedRange.start);
  const rangeEnd = formatDateInput(resolvedRange.end);

  let stats: AgencyStats | null = null;
  let loadError = false;

  try {
    stats = await getAgencyStats();
  } catch (error) {
    console.error('[agency/page] Error:', error);
    loadError = true;
  }

  const filteredDaily =
    stats?.daily.filter((row) => {
      if (!row.date) return false;
      return rangeValueForUi === 'all' || (row.date >= rangeStart && row.date <= rangeEnd);
    }) ?? [];

  const filteredSummary =
    stats && filteredDaily.length > 0
      ? Array.from(
          filteredDaily
            .reduce((map, row) => {
              const entry = map.get(row.agency) ?? {
                agency: row.agency,
                registrations: 0,
                blockedWithin7Days: 0,
                surveyResponses: 0,
                seminarApplications: 0,
                purchases: 0,
              };
              entry.registrations += row.registrations;
              entry.blockedWithin7Days += row.blockedWithin7Days;
              entry.surveyResponses += row.surveyResponses;
              entry.seminarApplications += row.seminarApplications;
              entry.purchases += row.purchases;
              map.set(row.agency, entry);
              return map;
            }, new Map<string, AgencyStats['summary'][number]>())
            .values(),
        ).sort((a, b) => b.registrations - a.registrations || b.surveyResponses - a.surveyResponses)
      : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[color:var(--color-text-primary)]">代理店</h1>
          {stats?.updatedAt ? (
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">データ更新日: {stats.updatedAt}</p>
          ) : null}
        </div>
        <InsightsRangeSelector
          options={RANGE_SELECT_OPTIONS}
          value={rangeValueForUi}
          customStart={customStart}
          customEnd={customEnd}
        />
      </div>

      {loadError ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6 text-sm text-[color:var(--color-text-secondary)]">
          データの読み込みに失敗しました。時間をおいて再度お試しください。
        </div>
      ) : !stats || stats.summary.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6 text-sm text-[color:var(--color-text-secondary)]">
          まだ流入元が記録された友だちがいません。Lステップの友だち情報「流入元」に値が入ると、ここに集計が表示されます。
        </div>
      ) : filteredDaily.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6 text-sm text-[color:var(--color-text-secondary)]">
          選択した期間に実績データがありません。
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
                    <th className="px-4 py-3 text-right">7日以内ブロック</th>
                    <th className="px-4 py-3 text-right">アンケート回答</th>
                    <th className="px-4 py-3 text-right">回答率</th>
                    <th className="px-4 py-3 text-right">セミナー申し込み</th>
                    <th className="px-4 py-3 text-right">申込率</th>
                    <th className="px-4 py-3 text-right">購入</th>
                    <th className="px-4 py-3 text-right">購入率</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSummary.map((row, index) => (
                    <tr key={row.agency} className="border-b border-[color:var(--color-border)] last:border-b-0">
                      <td className="px-4 py-3 font-semibold">{index + 1}</td>
                      <td className="px-4 py-3 font-medium text-[color:var(--color-text-primary)]">{row.agency}</td>
                      <td className="px-4 py-3 text-right">{row.registrations}</td>
                      <td className="px-4 py-3 text-right">{row.blockedWithin7Days}</td>
                      <td className="px-4 py-3 text-right">{row.surveyResponses}</td>
                      <td className="px-4 py-3 text-right text-[color:var(--color-text-secondary)]">
                        {formatRate(row.surveyResponses, row.registrations)}
                      </td>
                      <td className="px-4 py-3 text-right">{row.seminarApplications}</td>
                      <td className="px-4 py-3 text-right text-[color:var(--color-text-secondary)]">
                        {formatRate(row.seminarApplications, row.registrations)}
                      </td>
                      <td className="px-4 py-3 text-right">{row.purchases}</td>
                      <td className="px-4 py-3 text-right text-[color:var(--color-text-secondary)]">
                        {formatRate(row.purchases, row.registrations)}
                      </td>
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
                    <th className="px-4 py-3 text-right">7日以内ブロック</th>
                    <th className="px-4 py-3 text-right">アンケート回答</th>
                    <th className="px-4 py-3 text-right">回答率</th>
                    <th className="px-4 py-3 text-right">セミナー申し込み</th>
                    <th className="px-4 py-3 text-right">申込率</th>
                    <th className="px-4 py-3 text-right">購入</th>
                    <th className="px-4 py-3 text-right">購入率</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDaily.map((row, index) => (
                    <tr key={`${row.date}-${row.agency}-${index}`} className="border-b border-[color:var(--color-border)] last:border-b-0">
                      <td className="px-4 py-3">{row.date ?? '不明'}</td>
                      <td className="px-4 py-3 font-medium text-[color:var(--color-text-primary)]">{row.agency}</td>
                      <td className="px-4 py-3 text-right">{row.registrations}</td>
                      <td className="px-4 py-3 text-right">{row.blockedWithin7Days}</td>
                      <td className="px-4 py-3 text-right">{row.surveyResponses}</td>
                      <td className="px-4 py-3 text-right text-[color:var(--color-text-secondary)]">
                        {formatRate(row.surveyResponses, row.registrations)}
                      </td>
                      <td className="px-4 py-3 text-right">{row.seminarApplications}</td>
                      <td className="px-4 py-3 text-right text-[color:var(--color-text-secondary)]">
                        {formatRate(row.seminarApplications, row.registrations)}
                      </td>
                      <td className="px-4 py-3 text-right">{row.purchases}</td>
                      <td className="px-4 py-3 text-right text-[color:var(--color-text-secondary)]">
                        {formatRate(row.purchases, row.registrations)}
                      </td>
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
