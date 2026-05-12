'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { DashboardDateRangePicker } from '@/components/dashboard/DashboardDateRangePicker';
import { DashboardTabsInteractive } from '@/components/dashboard/DashboardTabsInteractive';
import { dashboardCardClass } from '@/components/dashboard/styles';
import type { AdsDashboardData } from '@/lib/ads/bigquery';

interface AdsDashboardShellProps {
  rangeOptions: Array<{ value: string; label: string }>;
  selectedRange: string;
  period: { start: string; end: string };
  data: AdsDashboardData;
}

const ADS_TAB_ITEMS = [{ id: 'home', label: 'ホーム' }];
const NOOP = () => {};

function yen(value: number): string {
  return `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

function num(value: number): string {
  return Math.round(value).toLocaleString('ja-JP');
}

function pct(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function mediaLabel(value: string): string {
  const labels: Record<string, string> = {
    image: '静止画',
    video: '動画',
    reels: 'リール',
    carousel: 'カルーセル',
    unknown: '不明',
  };
  return labels[value] ?? value;
}

export function AdsDashboardShell({ rangeOptions, selectedRange, period, data }: AdsDashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleRangeChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === rangeOptions[0]?.value) {
      params.delete('range');
    } else {
      params.set('range', value);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const primaryKpi = [
    { label: '消化金額', value: yen(data.summary.spend) },
    { label: 'インプレッション', value: num(data.summary.impressions) },
    { label: 'リンククリック', value: num(data.summary.inlineLinkClicks) },
    { label: 'Meta CV', value: num(data.summary.leads + data.summary.completeRegistrations + data.summary.purchases) },
    { label: 'LINE登録(全流入)', value: num(data.summary.lineRegistrations) },
  ];

  const costMetrics = [
    { label: 'CPM', value: yen(data.summary.cpm) },
    { label: 'CPC', value: yen(data.summary.cpc) },
    { label: 'LPC', value: yen(data.summary.lpc) },
    { label: 'Meta Lead CPA', value: data.summary.leads > 0 ? yen(data.summary.metaLeadCpa) : '—' },
    { label: 'LINE CPA(全流入)', value: data.summary.lineRegistrations > 0 ? yen(data.summary.lineCpa) : '—' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <DashboardTabsInteractive
          items={ADS_TAB_ITEMS}
          value="home"
          onChange={NOOP}
          className="flex-1 min-w-[160px]"
        />
        <DashboardDateRangePicker
          options={rangeOptions}
          value={selectedRange}
          onChange={handleRangeChange}
          allowCustom={false}
          latestLabel={`最新 ${period.end}`}
        />
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[color:var(--color-text-primary)]">広告ダッシュボード</h1>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
              {data.latestSyncedAt ? `最終同期: ${data.latestSyncedAt}` : 'Meta広告データ未同期'}
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {primaryKpi.map((item) => (
            <div key={item.label} className={dashboardCardClass}>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">{item.label}</p>
              <p className="mt-3 text-xl font-semibold text-[color:var(--color-text-primary)]">{item.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">費用指標</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          Meta側CVは広告マネージャーのactions、LINE CPAは現時点ではLステップ全流入登録数で割っています。
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {costMetrics.map((item) => (
            <div key={item.label} className={dashboardCardClass}>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">{item.label}</p>
              <p className="mt-3 text-xl font-semibold text-[color:var(--color-text-primary)]">{item.value}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">素材タイプ別</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-[color:var(--color-text-muted)]">
              <tr className="border-b border-[color:var(--color-border)]">
                <th className="py-2 pr-4">タイプ</th>
                <th className="py-2 pr-4 text-right">広告数</th>
                <th className="py-2 pr-4 text-right">消化金額</th>
                <th className="py-2 pr-4 text-right">リンククリック</th>
                <th className="py-2 pr-4 text-right">LPC</th>
                <th className="py-2 pr-4 text-right">Meta Lead</th>
                <th className="py-2 text-right">Lead CPA</th>
              </tr>
            </thead>
            <tbody>
              {data.byMediaType.map((row) => (
                <tr key={row.mediaType} className="border-b border-[color:var(--color-border)]">
                  <td className="py-3 pr-4 font-medium">{mediaLabel(row.mediaType)}</td>
                  <td className="py-3 pr-4 text-right">{num(row.ads)}</td>
                  <td className="py-3 pr-4 text-right">{yen(row.spend)}</td>
                  <td className="py-3 pr-4 text-right">{num(row.inlineLinkClicks)}</td>
                  <td className="py-3 pr-4 text-right">{row.inlineLinkClicks > 0 ? yen(row.lpc) : '—'}</td>
                  <td className="py-3 pr-4 text-right">{num(row.leads)}</td>
                  <td className="py-3 text-right">{row.leads > 0 ? yen(row.metaLeadCpa) : '—'}</td>
                </tr>
              ))}
              {data.byMediaType.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[color:var(--color-text-muted)]">この期間の広告データがありません。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">広告/クリエイティブ別</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-[color:var(--color-text-muted)]">
              <tr className="border-b border-[color:var(--color-border)]">
                <th className="py-2 pr-4">広告</th>
                <th className="py-2 pr-4">種別</th>
                <th className="py-2 pr-4 text-right">消化金額</th>
                <th className="py-2 pr-4 text-right">Imp</th>
                <th className="py-2 pr-4 text-right">CTR</th>
                <th className="py-2 pr-4 text-right">リンククリック</th>
                <th className="py-2 pr-4 text-right">LPC</th>
                <th className="py-2 pr-4 text-right">Meta Lead</th>
                <th className="py-2 text-right">Lead CPA</th>
              </tr>
            </thead>
            <tbody>
              {data.byAd.map((row) => (
                <tr key={row.adId} className="border-b border-[color:var(--color-border)] align-top">
                  <td className="py-3 pr-4">
                    <div className="max-w-[280px] font-medium text-[color:var(--color-text-primary)]">{row.adName}</div>
                    <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">{row.campaignName}</div>
                  </td>
                  <td className="py-3 pr-4">{mediaLabel(row.mediaType)}</td>
                  <td className="py-3 pr-4 text-right">{yen(row.spend)}</td>
                  <td className="py-3 pr-4 text-right">{num(row.impressions)}</td>
                  <td className="py-3 pr-4 text-right">{pct(row.ctr)}</td>
                  <td className="py-3 pr-4 text-right">{num(row.inlineLinkClicks)}</td>
                  <td className="py-3 pr-4 text-right">{row.inlineLinkClicks > 0 ? yen(row.lpc) : '—'}</td>
                  <td className="py-3 pr-4 text-right">{num(row.leads)}</td>
                  <td className="py-3 text-right">{row.leads > 0 ? yen(row.metaLeadCpa) : '—'}</td>
                </tr>
              ))}
              {data.byAd.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-[color:var(--color-text-muted)]">この期間の広告データがありません。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
