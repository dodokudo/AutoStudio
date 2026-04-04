'use client';

import { useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Table } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { DashboardDateRangePicker } from '@/components/dashboard/DashboardDateRangePicker';
import { DashboardTabsInteractive } from '@/components/dashboard/DashboardTabsInteractive';
import { dashboardCardClass } from '@/components/dashboard/styles';
import { UNIFIED_RANGE_OPTIONS } from '@/lib/dateRangePresets';
import type { AnalycaDashboardData, AnalycaDashboardTab } from '@/lib/analyca/dashboard';

interface AnalycaDashboardClientProps {
  initialData: AnalycaDashboardData;
  selectedRange: string;
  customStart?: string;
  customEnd?: string;
}

const TAB_ITEMS = [
  { id: 'summary', label: 'サマリー' },
  { id: 'funnel', label: 'ファネル' },
  { id: 'plans', label: 'プラン別' },
  { id: 'contracts', label: '契約一覧' },
] satisfies Array<{ id: AnalycaDashboardTab; label: string }>;

const numberFormatter = new Intl.NumberFormat('ja-JP');
const yenFormatter = new Intl.NumberFormat('ja-JP', {
  style: 'currency',
  currency: 'JPY',
  maximumFractionDigits: 0,
});

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '0';
  return numberFormatter.format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '-';
  return `${value.toFixed(1)}%`;
}

export function AnalycaDashboardClient({
  initialData,
  selectedRange,
  customStart,
  customEnd,
}: AnalycaDashboardClientProps) {
  const [activeTab, setActiveTab] = useState<AnalycaDashboardTab>('summary');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { kpis, dailyFunnel, planBreakdown, contracts, period } = initialData;

  const handleRangeChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', value);
    if (value !== 'custom') {
      params.delete('start');
      params.delete('end');
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const handleCustomChange = (start: string, end: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', 'custom');
    if (start) params.set('start', start);
    else params.delete('start');
    if (end) params.set('end', end);
    else params.delete('end');
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const kpiCards = [
    { label: '期間売上', value: yenFormatter.format(kpis.revenue) },
    { label: 'MRR', value: yenFormatter.format(kpis.mrr) },
    { label: '有効会員数', value: `${formatNumber(kpis.activeMembers)} 人` },
    { label: '有料会員数', value: `${formatNumber(kpis.paidMembers)} 人` },
    { label: 'トライアル会員数', value: `${formatNumber(kpis.trialMembers)} 人` },
    { label: '課金CVR', value: formatPercent(kpis.purchaseRate) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <DashboardTabsInteractive
          items={TAB_ITEMS}
          value={activeTab}
          onChange={(value) => setActiveTab(value as AnalycaDashboardTab)}
          className="flex-1 min-w-[240px]"
          aria-label="ANALYCAダッシュボード"
        />
        <DashboardDateRangePicker
          options={UNIFIED_RANGE_OPTIONS}
          value={selectedRange}
          onChange={handleRangeChange}
          allowCustom
          customStart={customStart}
          customEnd={customEnd}
          onCustomChange={handleCustomChange}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {kpiCards.map((card) => (
          <Card key={card.label} className={dashboardCardClass}>
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">{card.label}</p>
            <p className="mt-3 text-2xl font-semibold text-[color:var(--color-text-primary)]">{card.value}</p>
          </Card>
        ))}
      </div>

      {activeTab === 'summary' ? (
        <section className="space-y-4">
          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <Card className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">売上と課金ファネル推移</h2>
                </div>
              </div>
              <div className="mt-6 h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dailyFunnel}>
                    <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#6b7280' }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#6b7280' }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#6b7280' }} />
                    <Tooltip formatter={(value: number, name) => {
                      if (name === 'revenue') return [yenFormatter.format(Number(value)), '売上'];
                      if (name === 'lpViews') return [formatNumber(Number(value)), 'LP PV'];
                      return [formatNumber(Number(value)), '課金数'];
                    }} />
                  <Bar yAxisId="left" dataKey="revenue" fill="#8b5cf6" radius={[8, 8, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="lpViews" stroke="#2563eb" strokeWidth={2} dot={false} />
                  <Line yAxisId="right" type="monotone" dataKey="purchases" stroke="#10b981" strokeWidth={2} dot={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-6">
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">プラン別サマリー</h2>
              <div className="mt-5 space-y-3">
                {planBreakdown.length ? (
                  planBreakdown.slice(0, 8).map((plan) => (
                    <div
                      key={plan.key}
                      className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">{plan.label}</p>
                        <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">{yenFormatter.format(plan.revenue)}</p>
                      </div>
                      <p className="mt-2 text-xs text-[color:var(--color-text-secondary)]">
                        MRR {yenFormatter.format(plan.mrr)} / 有効 {formatNumber(plan.activeMembers)} / 有料 {formatNumber(plan.paidMembers)} / Trial {formatNumber(plan.trialMembers)} / 課金 {formatNumber(plan.purchases)}
                      </p>
                    </div>
                  ))
                ) : (
                  <EmptyState title="プラン集計がありません" description="ANALYCAの会員・決済データが入ると表示されます。" />
                )}
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">日別ファネル</h2>
            </div>
            <div className="mt-5 overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
              <Table>
                <thead>
                  <tr>
                    <th className="px-4 py-2 text-left">日付</th>
                    <th className="px-4 py-2 text-left">LP PV</th>
                    <th className="px-4 py-2 text-left">申込クリック</th>
                    <th className="px-4 py-2 text-left">LP→申込</th>
                    <th className="px-4 py-2 text-left">決済ページ</th>
                    <th className="px-4 py-2 text-left">決済押下</th>
                    <th className="px-4 py-2 text-left">決済→押下</th>
                    <th className="px-4 py-2 text-left">課金成功</th>
                    <th className="px-4 py-2 text-left">押下→課金</th>
                    <th className="px-4 py-2 text-left">売上</th>
                    <th className="px-4 py-2 text-left">LP→課金</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyFunnel.slice().reverse().map((row) => (
                    <tr key={row.date}>
                      <td className="px-4 py-2 font-medium text-[color:var(--color-text-primary)]">{row.date}</td>
                      <td className="px-4 py-2">{formatNumber(row.lpViews)}</td>
                      <td className="px-4 py-2">{formatNumber(row.checkoutStarts)}</td>
                      <td className="px-4 py-2">{formatPercent(row.lpToCheckoutRate)}</td>
                      <td className="px-4 py-2">{formatNumber(row.checkoutPageViews)}</td>
                      <td className="px-4 py-2">{formatNumber(row.paymentSubmits)}</td>
                      <td className="px-4 py-2">{formatPercent(row.checkoutToSubmitRate)}</td>
                      <td className="px-4 py-2">{formatNumber(row.purchases)}</td>
                      <td className="px-4 py-2">{formatPercent(row.submitToPurchaseRate)}</td>
                      <td className="px-4 py-2">{yenFormatter.format(row.revenue)}</td>
                      <td className="px-4 py-2">{formatPercent(row.purchaseRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Card>
        </section>
      ) : null}

      {activeTab === 'funnel' ? (
        <Card className="p-6">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">LP → 決済 → 課金ファネル</h2>
          </div>
          <div className="mt-5 overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
            <Table>
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left">日付</th>
                  <th className="px-4 py-2 text-left">LP PV</th>
                  <th className="px-4 py-2 text-left">申込クリック</th>
                  <th className="px-4 py-2 text-left">LP→申込</th>
                  <th className="px-4 py-2 text-left">決済ページ</th>
                  <th className="px-4 py-2 text-left">決済押下</th>
                  <th className="px-4 py-2 text-left">決済→押下</th>
                  <th className="px-4 py-2 text-left">課金成功</th>
                  <th className="px-4 py-2 text-left">押下→課金</th>
                  <th className="px-4 py-2 text-left">売上</th>
                  <th className="px-4 py-2 text-left">LP→課金</th>
                </tr>
              </thead>
              <tbody>
                {dailyFunnel.slice().reverse().map((row) => (
                  <tr key={row.date}>
                    <td className="px-4 py-2 font-medium text-[color:var(--color-text-primary)]">{row.date}</td>
                    <td className="px-4 py-2">{formatNumber(row.lpViews)}</td>
                    <td className="px-4 py-2">{formatNumber(row.checkoutStarts)}</td>
                    <td className="px-4 py-2">{formatPercent(row.lpToCheckoutRate)}</td>
                    <td className="px-4 py-2">{formatNumber(row.checkoutPageViews)}</td>
                    <td className="px-4 py-2">{formatNumber(row.paymentSubmits)}</td>
                    <td className="px-4 py-2">{formatPercent(row.checkoutToSubmitRate)}</td>
                    <td className="px-4 py-2">{formatNumber(row.purchases)}</td>
                    <td className="px-4 py-2">{formatPercent(row.submitToPurchaseRate)}</td>
                    <td className="px-4 py-2">{yenFormatter.format(row.revenue)}</td>
                    <td className="px-4 py-2">{formatPercent(row.purchaseRate)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      ) : null}

      {activeTab === 'plans' ? (
        <Card className="p-6">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">プラン別の人数・売上</h2>
          </div>
          <div className="mt-5 overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
            <Table>
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left">プラン</th>
                  <th className="px-4 py-2 text-left">有効会員</th>
                  <th className="px-4 py-2 text-left">有料会員</th>
                  <th className="px-4 py-2 text-left">トライアル</th>
                  <th className="px-4 py-2 text-left">MRR</th>
                  <th className="px-4 py-2 text-left">期間課金数</th>
                  <th className="px-4 py-2 text-left">期間売上</th>
                </tr>
              </thead>
              <tbody>
                {planBreakdown.map((plan) => (
                  <tr key={plan.key}>
                    <td className="px-4 py-2 font-medium text-[color:var(--color-text-primary)]">{plan.label}</td>
                    <td className="px-4 py-2">{formatNumber(plan.activeMembers)}</td>
                    <td className="px-4 py-2">{formatNumber(plan.paidMembers)}</td>
                    <td className="px-4 py-2">{formatNumber(plan.trialMembers)}</td>
                    <td className="px-4 py-2">{yenFormatter.format(plan.mrr)}</td>
                    <td className="px-4 py-2">{formatNumber(plan.purchases)}</td>
                    <td className="px-4 py-2">{yenFormatter.format(plan.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      ) : null}

      {activeTab === 'contracts' ? (
        <Card className="p-6">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">契約一覧</h2>
          </div>
          <div className="mt-5 overflow-x-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
            <Table>
              <thead>
                <tr>
                  <th className="px-4 py-2 text-left">決済日時</th>
                  <th className="px-4 py-2 text-left">金額</th>
                  <th className="px-4 py-2 text-left">プラン</th>
                  <th className="px-4 py-2 text-left">購入者</th>
                  <th className="px-4 py-2 text-left">電話番号</th>
                  <th className="px-4 py-2 text-left">アカウント</th>
                  <th className="px-4 py-2 text-left">状態</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-2 font-medium text-[color:var(--color-text-primary)]">{row.purchasedAt}</td>
                    <td className="px-4 py-2">{yenFormatter.format(row.amount)}</td>
                    <td className="px-4 py-2">{row.planLabel}</td>
                    <td className="px-4 py-2">{row.customerName}</td>
                    <td className="px-4 py-2">{row.customerPhone}</td>
                    <td className="px-4 py-2">{row.accountHandle}</td>
                    <td className="px-4 py-2">{row.accountStatus}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
