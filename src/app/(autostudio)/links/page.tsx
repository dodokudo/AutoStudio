import { getLinkInsightsOverview } from '@/lib/links/bigquery';
import { LinksList } from './_components/links-list';
import { CreateLinkForm } from './_components/create-link-form';
import { LinksTabShell, type LinksTabKey } from './_components/links-tab-shell';
import { LinksInsightsDashboard } from './_components/links-insights-dashboard';
import { LinksRangeSelector } from './_components/links-range-selector';
import { LinkFunnelsManager } from './_components/link-funnels-manager';

type RangeValue = 'yesterday' | '3d' | '7d' | 'month' | 'custom';

const DEFAULT_RANGE: RangeValue = '7d';

const RANGE_OPTIONS: Array<{ value: RangeValue; label: string }> = [
  { value: 'yesterday', label: '昨日' },
  { value: '3d', label: '過去3日間' },
  { value: '7d', label: '過去7日間' },
  { value: 'month', label: '今月' },
  { value: 'custom', label: 'カスタム' },
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(value?: string): value is string {
  return typeof value === 'string' && DATE_PATTERN.test(value);
}

function toJstDate(date: Date): Date {
  return new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
}

function formatDateJst(date: Date): string {
  return date
    .toLocaleDateString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    .replace(/\//g, '-');
}

function addDays(date: Date, diff: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + diff);
  return next;
}

function resolveRangeDates(range: RangeValue, customStart?: string, customEnd?: string): { startDate: string; endDate: string } {
  const today = toJstDate(new Date());
  const todayDateString = formatDateJst(today);

  switch (range) {
    case 'yesterday': {
      const yesterday = addDays(today, -1);
      const date = formatDateJst(yesterday);
      return { startDate: date, endDate: date };
    }
    case '3d': {
      const end = today;
      const start = addDays(today, -2);
      return { startDate: formatDateJst(start), endDate: formatDateJst(end) };
    }
    case '7d': {
      const end = today;
      const start = addDays(today, -6);
      return { startDate: formatDateJst(start), endDate: formatDateJst(end) };
    }
    case 'month': {
      const end = today;
      const start = new Date(today);
      start.setDate(1);
      return { startDate: formatDateJst(start), endDate: formatDateJst(end) };
    }
    case 'custom': {
      if (customStart && customEnd) {
        return { startDate: customStart, endDate: customEnd };
      }
      if (customStart) {
        return { startDate: customStart, endDate: customStart };
      }
      if (customEnd) {
        return { startDate: customEnd, endDate: customEnd };
      }
      return resolveRangeDates(DEFAULT_RANGE);
    }
    default:
      return { startDate: todayDateString, endDate: todayDateString };
  }
}

export const dynamic = 'force-dynamic';

interface LinksPageProps {
  searchParams?: Promise<Record<string, string>>;
}

export default async function LinksPage({ searchParams }: LinksPageProps) {
  const resolvedParams = (await searchParams) ?? {};

  const tabParam = typeof resolvedParams.tab === 'string' ? (resolvedParams.tab as LinksTabKey) : undefined;
  const allowedTabs: LinksTabKey[] = ['manage', 'insights', 'funnels'];
  const defaultTab: LinksTabKey = 'manage';
  const activeTab: LinksTabKey =
    tabParam && allowedTabs.includes(tabParam) ? tabParam : defaultTab;

  const tabItems = allowedTabs.map((tab) => ({
    id: tab,
    label: tab === 'manage' ? 'リンク管理' : tab === 'insights' ? 'インサイト' : 'ファネル',
    href: `?tab=${tab}`,
  }));

  const rangeParam = typeof resolvedParams.range === 'string' ? (resolvedParams.range as RangeValue) : undefined;
  const allowedRangeValues = RANGE_OPTIONS.map((option) => option.value);
  const rangeValue: RangeValue = rangeParam && allowedRangeValues.includes(rangeParam) ? rangeParam : DEFAULT_RANGE;

  let customStart = isValidDate(resolvedParams.start) ? resolvedParams.start : undefined;
  let customEnd = isValidDate(resolvedParams.end) ? resolvedParams.end : undefined;
  if (customStart && customEnd && customStart > customEnd) {
    [customStart, customEnd] = [customEnd, customStart];
  }

  const { startDate, endDate } = resolveRangeDates(rangeValue, customStart, customEnd);
  const periodLabel = `${startDate} 〜 ${endDate}`;

  const needInsights = activeTab === 'insights';
  const insights = needInsights ? await getLinkInsightsOverview({ startDate, endDate }) : null;

  return (
    <LinksTabShell
      tabItems={tabItems}
      activeTab={activeTab}
      toolbar={
        activeTab !== 'manage' ? (
          <LinksRangeSelector
            options={RANGE_OPTIONS}
            value={rangeValue}
            customStart={customStart}
            customEnd={customEnd}
            latestLabel={periodLabel}
          />
        ) : undefined
      }
    >
      {activeTab === 'manage' ? (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-[color:var(--color-text-primary)]">リンク管理</h1>
            <p className="mt-2 text-sm text-[color:var(--color-text-secondary)]">
              カスタムOGP設定付きの短縮リンクを作成・管理
            </p>
          </div>
          <CreateLinkForm />
          <LinksList />
        </div>
      ) : activeTab === 'insights' ? (
        insights ? (
        <LinksInsightsDashboard summary={insights.summary} links={insights.links} />
        ) : (
          <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-6 text-sm text-[color:var(--color-text-secondary)]">
            インサイトの読み込みに失敗しました。時間をおいて再度お試しください。
          </div>
        )
      ) : (
        <LinkFunnelsManager startDate={startDate} endDate={endDate} />
      )}
    </LinksTabShell>
  );
}
