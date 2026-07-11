import Link from 'next/link';

import { getAgencyStats, type AgencyStats } from '@/lib/agency';
import { classNames } from '@/lib/classNames';
import { UNIFIED_RANGE_OPTIONS, formatDateInput, isUnifiedRangePreset, resolveDateRange, type UnifiedRangePreset } from '@/lib/dateRangePresets';
import { InsightsRangeSelector } from '../threads/_components/insights-range-selector';
import { AgencyRewardPanel } from './_components/agency-reward-panel';

export const dynamic = 'force-dynamic';

type AgencyTabKey = 'overview' | 'ranking' | 'daily' | 'management';
type AgencySummaryRow = AgencyStats['summary'][number];
type AgencyDailyRow = AgencyStats['daily'][number];

const RANGE_SELECT_OPTIONS = UNIFIED_RANGE_OPTIONS.map((option) =>
  option.value === '1d' ? { ...option, label: '今日' } : option,
);

const TAB_ITEMS: Array<{ id: AgencyTabKey; label: string }> = [
  { id: 'overview', label: '全体管理' },
  { id: 'ranking', label: 'ランキング' },
  { id: 'daily', label: '日別' },
  { id: 'management', label: '代理店管理' },
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value);
}

function formatRate(numerator: number, denominator: number): string {
  if (denominator <= 0) return '0.0%';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function rateValue(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return numerator / denominator;
}

function sortByRate(
  rows: AgencySummaryRow[],
  numerator: (row: AgencySummaryRow) => number,
): AgencySummaryRow[] {
  return [...rows].sort(
    (a, b) => rateValue(numerator(b), b.registrations) - rateValue(numerator(a), a.registrations) || b.registrations - a.registrations,
  );
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysBetween(start: Date, end: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay);
}

function summarizeDailyRows(rows: AgencyDailyRow[]): AgencySummaryRow[] {
  return Array.from(
    rows
      .reduce((map, row) => {
        const entry = map.get(row.agency) ?? {
          agency: row.agency,
          registrations: 0,
          blockedWithin7Days: 0,
          surveyResponses: 0,
          seminarApplications: 0,
          purchases: 0,
          purchasesWithin30Days: 0,
          qualifiedListRewards: 0,
        };
        entry.registrations += row.registrations;
        entry.blockedWithin7Days += row.blockedWithin7Days;
        entry.surveyResponses += row.surveyResponses;
        entry.seminarApplications += row.seminarApplications;
        entry.purchases += row.purchases;
        entry.purchasesWithin30Days += row.purchasesWithin30Days;
        entry.qualifiedListRewards += row.qualifiedListRewards;
        map.set(row.agency, entry);
        return map;
      }, new Map<string, AgencySummaryRow>())
      .values(),
  ).sort((a, b) => b.registrations - a.registrations || b.surveyResponses - a.surveyResponses);
}

function buildTabHref(
  tab: AgencyTabKey,
  rangeValue: UnifiedRangePreset,
  customStart: string | undefined,
  customEnd: string | undefined,
  agency: string,
): string {
  const params = new URLSearchParams();
  params.set('tab', tab);
  params.set('range', rangeValue);
  if (agency !== 'all') params.set('agency', agency);
  if (rangeValue === 'custom') {
    if (customStart) params.set('start', customStart);
    if (customEnd) params.set('end', customEnd);
  }
  return `?${params.toString()}`;
}

function buildAgencyHref(
  agency: string,
  tab: AgencyTabKey,
  rangeValue: UnifiedRangePreset,
  customStart: string | undefined,
  customEnd: string | undefined,
): string {
  return buildTabHref(tab, rangeValue, customStart, customEnd, agency);
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6 text-sm text-[color:var(--color-text-secondary)]">
      {children}
    </div>
  );
}

function SectionPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-text-primary)]">{title}</h2>
      {children}
    </section>
  );
}

function RankingTable({
  rows,
  activeTab,
  rangeValue,
  customStart,
  customEnd,
  compact = false,
}: {
  rows: AgencySummaryRow[];
  activeTab: AgencyTabKey;
  rangeValue: UnifiedRangePreset;
  customStart: string | undefined;
  customEnd: string | undefined;
  compact?: boolean;
}) {
  const visibleRows = compact ? rows.slice(0, 5) : rows;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-sm">
        <thead>
          <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-text-secondary)]">
            <th className="px-4 py-3">順位</th>
            <th className="px-4 py-3">流入元</th>
            <th className="px-4 py-3 text-right">登録数</th>
            <th className="px-4 py-3 text-right">7日以内ブロック</th>
            <th className="px-4 py-3 text-right">アンケート回答</th>
            <th className="px-4 py-3 text-right">回答率</th>
            <th className="px-4 py-3 text-right">セミナー申込</th>
            <th className="px-4 py-3 text-right">申込率</th>
            <th className="px-4 py-3 text-right">購入</th>
            <th className="px-4 py-3 text-right">購入率</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, index) => (
            <tr key={row.agency} className="border-b border-[color:var(--color-border)] last:border-b-0">
              <td className="px-4 py-3 font-semibold">{index + 1}</td>
              <td className="px-4 py-3 font-medium">
                <Link
                  href={buildAgencyHref(row.agency, activeTab, rangeValue, customStart, customEnd)}
                  scroll={false}
                  className="text-[color:var(--color-text-primary)] hover:text-[color:var(--color-accent)]"
                >
                  {row.agency}
                </Link>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.registrations)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.blockedWithin7Days)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.surveyResponses)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-[color:var(--color-text-secondary)]">
                {formatRate(row.surveyResponses, row.registrations)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.seminarApplications)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-[color:var(--color-text-secondary)]">
                {formatRate(row.seminarApplications, row.registrations)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.purchases)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-[color:var(--color-text-secondary)]">
                {formatRate(row.purchases, row.registrations)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyTable({ rows }: { rows: AgencyDailyRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-sm">
        <thead>
          <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-text-secondary)]">
            <th className="px-4 py-3">登録日</th>
            <th className="px-4 py-3">流入元</th>
            <th className="px-4 py-3 text-right">登録数</th>
            <th className="px-4 py-3 text-right">7日以内ブロック</th>
            <th className="px-4 py-3 text-right">アンケート回答</th>
            <th className="px-4 py-3 text-right">回答率</th>
            <th className="px-4 py-3 text-right">セミナー申込</th>
            <th className="px-4 py-3 text-right">申込率</th>
            <th className="px-4 py-3 text-right">購入</th>
            <th className="px-4 py-3 text-right">購入率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.date}-${row.agency}-${index}`} className="border-b border-[color:var(--color-border)] last:border-b-0">
              <td className="px-4 py-3">{row.date ?? '不明'}</td>
              <td className="px-4 py-3 font-medium text-[color:var(--color-text-primary)]">{row.agency}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.registrations)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.blockedWithin7Days)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.surveyResponses)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-[color:var(--color-text-secondary)]">
                {formatRate(row.surveyResponses, row.registrations)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.seminarApplications)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-[color:var(--color-text-secondary)]">
                {formatRate(row.seminarApplications, row.registrations)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{formatNumber(row.purchases)}</td>
              <td className="px-4 py-3 text-right tabular-nums text-[color:var(--color-text-secondary)]">
                {formatRate(row.purchases, row.registrations)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompactRankList({
  title,
  rows,
  value,
}: {
  title: string;
  rows: AgencySummaryRow[];
  value: (row: AgencySummaryRow) => string;
}) {
  return (
    <section className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-4">
      <h2 className="text-sm font-semibold text-[color:var(--color-text-primary)]">{title}</h2>
      <div className="mt-3 divide-y divide-[color:var(--color-border)]">
        {rows.slice(0, 5).map((row, index) => (
          <div key={`${title}-${row.agency}`} className="flex items-center justify-between gap-3 py-3 text-sm">
            <div className="min-w-0">
              <span className="mr-2 font-semibold text-[color:var(--color-text-muted)]">{index + 1}</span>
              <span className="font-medium text-[color:var(--color-text-primary)]">{row.agency}</span>
            </div>
            <span className="shrink-0 tabular-nums text-[color:var(--color-text-secondary)]">{value(row)}</span>
          </div>
        ))}
      </div>
    </section>
  );
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
  const tabParam = typeof resolvedSearchParams?.tab === 'string' ? resolvedSearchParams.tab : undefined;
  const agencyParam = typeof resolvedSearchParams?.agency === 'string' ? resolvedSearchParams.agency : undefined;
  const activeTab: AgencyTabKey = TAB_ITEMS.some((tab) => tab.id === tabParam) ? (tabParam as AgencyTabKey) : 'overview';
  const selectedRangeValue: UnifiedRangePreset = isUnifiedRangePreset(rangeParam) ? rangeParam : 'all';
  const resolvedRange = resolveDateRange(selectedRangeValue, startParam, endParam, { includeToday: true });
  const rangeValueForUi = resolvedRange.preset;
  const customStart = rangeValueForUi === 'custom' ? formatDateInput(resolvedRange.start) : startParam;
  const customEnd = rangeValueForUi === 'custom' ? formatDateInput(resolvedRange.end) : endParam;
  const rangeStart = formatDateInput(resolvedRange.start);
  const rangeEnd = formatDateInput(resolvedRange.end);
  const noteText =
    resolvedRange.preset === 'all'
      ? 'レポート期間: 全期間'
      : `レポート期間: ${rangeStart} 〜 ${rangeEnd}`;

  let stats: AgencyStats | null = null;
  let loadError = false;

  try {
    stats = await getAgencyStats();
  } catch (error) {
    console.error('[agency/page] Error:', error);
    loadError = true;
  }

  const rangeFilteredDaily =
    stats?.daily.filter((row) => {
      if (!row.date) return false;
      return rangeValueForUi === 'all' || (row.date >= rangeStart && row.date <= rangeEnd);
    }) ?? [];

  const agencyOptions = stats?.summary.map((row) => row.agency).sort((a, b) => a.localeCompare(b, 'ja')) ?? [];
  const selectedAgency = agencyParam && agencyOptions.includes(agencyParam) ? agencyParam : 'all';
  const filteredDaily =
    selectedAgency === 'all'
      ? rangeFilteredDaily
      : rangeFilteredDaily.filter((row) => row.agency === selectedAgency);

  const filteredSummary = stats && filteredDaily.length > 0 ? summarizeDailyRows(filteredDaily) : [];

  const previousRangeLengthDays = daysBetween(resolvedRange.start, resolvedRange.end) + 1;
  const previousRangeStart = addDays(resolvedRange.start, -previousRangeLengthDays);
  const previousRangeEnd = addDays(resolvedRange.start, -1);
  const previousRangeStartText = formatDateInput(previousRangeStart);
  const previousRangeEndText = formatDateInput(previousRangeEnd);
  const previousRangeFilteredDaily =
    stats && rangeValueForUi !== 'all'
      ? stats.daily.filter((row) => {
          if (!row.date) return false;
          if (row.date < previousRangeStartText || row.date > previousRangeEndText) return false;
          return selectedAgency === 'all' || row.agency === selectedAgency;
        })
      : [];
  const previousSummary = previousRangeFilteredDaily.length > 0 ? summarizeDailyRows(previousRangeFilteredDaily) : [];

  const seminarRanking = [...filteredSummary].sort((a, b) => b.seminarApplications - a.seminarApplications || b.registrations - a.registrations);
  const purchaseRanking = [...filteredSummary].sort((a, b) => b.purchases - a.purchases || b.registrations - a.registrations);
  const surveyRateRanking = sortByRate(filteredSummary, (row) => row.surveyResponses);
  const blockRateRanking = sortByRate(filteredSummary, (row) => row.blockedWithin7Days);

  const tabNav = (
    <nav className="-mx-1 flex min-w-0 max-w-full gap-1 overflow-x-auto px-1 pb-1 scrollbar-hide xl:flex-wrap xl:items-end xl:overflow-visible xl:pb-0">
      {TAB_ITEMS.map((item) => {
        const isActive = item.id === activeTab;
        return (
          <Link
            key={item.id}
            href={buildTabHref(item.id, rangeValueForUi, customStart, customEnd, selectedAgency)}
            scroll={false}
            className={classNames(
              'relative shrink-0 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-accent)]',
              isActive
                ? 'text-[color:var(--color-accent)]'
                : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]',
            )}
          >
            {item.label}
            {isActive ? <span className="pointer-events-none absolute inset-x-4 bottom-0 h-[2px] rounded-full bg-[color:var(--color-accent)]" /> : null}
          </Link>
        );
      })}
    </nav>
  );

  const agencySelector = (
    <form className="flex min-w-[180px] items-center gap-2" action="/agency">
      <input type="hidden" name="tab" value={activeTab} />
      <input type="hidden" name="range" value={rangeValueForUi} />
      {rangeValueForUi === 'custom' && customStart ? <input type="hidden" name="start" value={customStart} /> : null}
      {rangeValueForUi === 'custom' && customEnd ? <input type="hidden" name="end" value={customEnd} /> : null}
      <label className="sr-only" htmlFor="agency-filter">
        代理店
      </label>
      <select
        id="agency-filter"
        name="agency"
        defaultValue={selectedAgency}
        className="h-9 min-w-[150px] rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text-primary)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
      >
        <option value="all">全体の代理店</option>
        {agencyOptions.map((agency) => (
          <option key={agency} value={agency}>
            {agency}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 text-sm font-medium text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]"
      >
        表示
      </button>
    </form>
  );

  let content: React.ReactNode;

  if (loadError) {
    content = <EmptyState>データの読み込みに失敗しました。時間をおいて再度お試しください。</EmptyState>;
  } else if (!stats || stats.summary.length === 0) {
    content = <EmptyState>まだ流入元が記録された友だちがいません。</EmptyState>;
  } else if (filteredDaily.length === 0) {
    content = <EmptyState>選択した期間に実績データがありません。</EmptyState>;
  } else if (activeTab === 'daily') {
    content = (
      <SectionPanel title="日別インサイト">
        <DailyTable rows={filteredDaily} />
      </SectionPanel>
    );
  } else if (activeTab === 'ranking') {
    content = (
      <div className="space-y-5">
        <SectionPanel title="ランキング">
          <RankingTable
            rows={filteredSummary}
            activeTab={activeTab}
            rangeValue={rangeValueForUi}
            customStart={customStart}
            customEnd={customEnd}
          />
        </SectionPanel>
        <div className="grid gap-4 lg:grid-cols-2">
          <CompactRankList title="セミナー申込" rows={seminarRanking} value={(row) => `${formatNumber(row.seminarApplications)}件`} />
          <CompactRankList title="購入" rows={purchaseRanking} value={(row) => `${formatNumber(row.purchases)}件`} />
          <CompactRankList title="回答率" rows={surveyRateRanking} value={(row) => formatRate(row.surveyResponses, row.registrations)} />
          <CompactRankList title="ブロック率" rows={blockRateRanking} value={(row) => formatRate(row.blockedWithin7Days, row.registrations)} />
        </div>
      </div>
    );
  } else if (activeTab === 'management') {
    content = (
      <AgencyRewardPanel
        rows={filteredSummary}
        previousRows={previousSummary}
        initialRewardSettings={stats?.rewardSettings}
        title="代理店管理"
        note={noteText}
      />
    );
  } else {
    content = (
      <div className="space-y-5">
        <AgencyRewardPanel
          rows={filteredSummary}
          previousRows={previousSummary}
          initialRewardSettings={stats?.rewardSettings}
          title="全体管理"
          note={noteText}
          showTable={false}
        />
        <SectionPanel title="ランキング">
          <RankingTable
            rows={filteredSummary}
            activeTab={activeTab}
            rangeValue={rangeValueForUi}
            customStart={customStart}
            customEnd={customEnd}
          />
        </SectionPanel>
        <SectionPanel title="日別インサイト">
          <DailyTable rows={filteredDaily} />
        </SectionPanel>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="section-stack min-w-0">
        <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          {tabNav}
          <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center xl:justify-end">
            {agencySelector}
            <InsightsRangeSelector
              options={RANGE_SELECT_OPTIONS}
              value={rangeValueForUi}
              customStart={customStart}
              customEnd={customEnd}
            />
          </div>
        </div>

        {content}
      </div>
    </div>
  );
}
