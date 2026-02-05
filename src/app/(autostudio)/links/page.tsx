import { getLinkInsightsOverview } from '@/lib/links/bigquery';
import { LinksList } from './_components/links-list';
import { CreateLinkForm } from './_components/create-link-form';
import { LinksTabShell, type LinksTabKey } from './_components/links-tab-shell';
import { LinksInsightsDashboard } from './_components/links-insights-dashboard';
import { LinksRangeSelector } from './_components/links-range-selector';
import { LinkFunnelsManager } from './_components/link-funnels-manager';
import { UNIFIED_RANGE_OPTIONS, resolveDateRange, formatDateInput, isUnifiedRangePreset, type UnifiedRangePreset } from '@/lib/dateRangePresets';

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

  const rangeParam = typeof resolvedParams.range === 'string' ? resolvedParams.range : undefined;
  const rangeValue: UnifiedRangePreset = isUnifiedRangePreset(rangeParam) ? rangeParam : '7d';

  const customStart = resolvedParams.start;
  const customEnd = resolvedParams.end;

  const { start: startDateObj, end: endDateObj, preset } = resolveDateRange(rangeValue, customStart, customEnd);
  const startDate = formatDateInput(startDateObj);
  const endDate = formatDateInput(endDateObj);
  const periodLabel = preset === 'all' ? `全期間 (${startDate} 〜 ${endDate})` : `${startDate} 〜 ${endDate}`;

  const needInsights = activeTab === 'insights';
  const insights = needInsights ? await getLinkInsightsOverview({ startDate, endDate }) : null;

  return (
    <LinksTabShell
      tabItems={tabItems}
      activeTab={activeTab}
      toolbar={
        activeTab !== 'manage' ? (
          <LinksRangeSelector
            options={UNIFIED_RANGE_OPTIONS}
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
