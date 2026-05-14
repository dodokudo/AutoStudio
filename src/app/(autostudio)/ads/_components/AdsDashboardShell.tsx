'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { DashboardDateRangePicker } from '@/components/dashboard/DashboardDateRangePicker';
import { DashboardTabsInteractive } from '@/components/dashboard/DashboardTabsInteractive';
import { dashboardCardClass } from '@/components/dashboard/styles';
import type { AdsByAdRow, AdsDashboardData } from '@/lib/ads/bigquery';
import type { ReelAdInsightRow } from '@/lib/ads/reelInsights';
import { ReelDropoffSection } from './ReelDropoffSection';

interface AdsDashboardShellProps {
  rangeOptions: Array<{ value: string; label: string }>;
  selectedRange: string;
  period: { start: string; end: string };
  data: AdsDashboardData;
  reelAdRows: ReelAdInsightRow[];
}

type AdsTabKey = 'home' | 'creative';
type CreativeSortKey = 'spend' | 'impressions' | 'ctr' | 'inlineLinkClicks' | 'lpc' | 'clicks';

const ADS_TAB_ITEMS: Array<{ id: AdsTabKey; label: string }> = [
  { id: 'home', label: 'ホーム' },
  { id: 'creative', label: 'クリエイティブ' },
];

function yen(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

function num(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('ja-JP');
}

function pct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
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

function metricValue(value: string, note?: string) {
  return (
    <div>
      <p className="mt-3 text-xl font-semibold text-[color:var(--color-text-primary)]">{value}</p>
      {note ? <p className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">{note}</p> : null}
    </div>
  );
}

function CreativeThumb({ row }: { row: AdsByAdRow }) {
  const imageUrl = row.imageUrl || row.thumbnailUrl;
  const isImage = row.mediaType === 'image';
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] ${
        isImage ? 'h-28 w-28' : 'h-32 w-20'
      }`}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={row.adName} className={`h-full w-full ${isImage ? 'object-contain' : 'object-cover'}`} loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-[color:var(--color-text-muted)]">No image</div>
      )}
      {row.mediaType !== 'image' ? (
        <div className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {mediaLabel(row.mediaType)}
        </div>
      ) : null}
    </div>
  );
}

function getCreativeSortValue(row: AdsByAdRow, key: CreativeSortKey): number {
  if (key === 'spend') return row.spend;
  if (key === 'impressions') return row.impressions;
  if (key === 'ctr') return row.ctr;
  if (key === 'inlineLinkClicks') return row.inlineLinkClicks;
  if (key === 'lpc') return row.inlineLinkClicks > 0 ? row.lpc : Number.POSITIVE_INFINITY;
  return row.clicks;
}

const CREATIVE_SORT_OPTIONS: Array<{ key: CreativeSortKey; label: string; directionLabel: string }> = [
  { key: 'spend', label: '消化金額', directionLabel: '高い順' },
  { key: 'impressions', label: 'Imp', directionLabel: '多い順' },
  { key: 'inlineLinkClicks', label: 'リンク', directionLabel: '多い順' },
  { key: 'ctr', label: 'CTR', directionLabel: '高い順' },
  { key: 'lpc', label: 'LPC', directionLabel: '低い順' },
  { key: 'clicks', label: 'クリック', directionLabel: '多い順' },
];

export function AdsDashboardShell({ rangeOptions, selectedRange, period, data, reelAdRows }: AdsDashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<AdsTabKey>('home');
  const [creativeSort, setCreativeSort] = useState<CreativeSortKey>('spend');

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

  const topCreatives = useMemo(() => data.byAd.slice(0, 5), [data.byAd]);
  const sortedCreatives = useMemo(() => {
    const sorted = [...data.byAd].sort((a, b) => {
      const aValue = getCreativeSortValue(a, creativeSort);
      const bValue = getCreativeSortValue(b, creativeSort);
      if (creativeSort === 'lpc') return aValue - bValue;
      return bValue - aValue;
    });
    return sorted;
  }, [creativeSort, data.byAd]);

  const primaryKpi = [
    { label: '消化金額', value: yen(data.summary.spend) },
    { label: 'インプレッション', value: num(data.summary.impressions) },
    { label: '広告リンククリック', value: num(data.summary.inlineLinkClicks), note: `CTR ${pct(data.summary.inlineLinkCtr)}` },
    { label: 'LP内LINEクリック', value: num(data.summary.launchkitLineClicks), note: `クリック率 ${pct(data.summary.lineClickRate)}` },
    { label: 'LINE登録(全流入)', value: num(data.summary.lineRegistrations) },
  ];

  const costMetrics = [
    { label: 'CPM', value: yen(data.summary.cpm) },
    { label: 'CPC', value: yen(data.summary.cpc) },
    { label: '広告LPC', value: yen(data.summary.lpc) },
    { label: 'Meta Lead CPA', value: data.summary.leads > 0 ? yen(data.summary.metaLeadCpa) : '—' },
    { label: 'LINE CPA(全流入)', value: data.summary.lineRegistrations > 0 ? yen(data.summary.lineCpa) : '—' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <DashboardTabsInteractive
          items={ADS_TAB_ITEMS}
          value={activeTab}
          onChange={(value) => setActiveTab(value as AdsTabKey)}
          className="flex-1 min-w-[220px]"
        />
        <DashboardDateRangePicker
          options={rangeOptions}
          value={selectedRange}
          onChange={handleRangeChange}
          allowCustom={false}
          latestLabel={`最新 ${period.end}`}
        />
      </div>

      {activeTab === 'home' && (
        <div className="space-y-6">
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
                  {metricValue(item.value, item.note)}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">費用指標</h2>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
              LP内LINEクリックはLaunchKit計測、LINE登録はLステップ全流入から取得しています。広告別のLINE登録突合は広告ID付きURL運用が必要です。
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {costMetrics.map((item) => (
                <div key={item.label} className={dashboardCardClass}>
                  <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">{item.label}</p>
                  {metricValue(item.value)}
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <Card className="p-6">
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">素材タイプ別</h2>
              <div className="mt-4 space-y-3">
                {data.byMediaType.map((row) => (
                  <div key={row.mediaType} className="rounded-md border border-[color:var(--color-border)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-[color:var(--color-text-primary)]">{mediaLabel(row.mediaType)}</p>
                        <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">{num(row.ads)}件</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-[color:var(--color-text-primary)]">{yen(row.spend)}</p>
                        <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">LPC {row.inlineLinkClicks > 0 ? yen(row.lpc) : '—'}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {data.byMediaType.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">この期間の広告データがありません。</p>
                ) : null}
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">上位クリエイティブ</h2>
                <button
                  type="button"
                  onClick={() => setActiveTab('creative')}
                  className="text-sm font-medium text-[color:var(--color-text-primary)] underline-offset-4 hover:underline"
                >
                  すべて見る
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {topCreatives.map((row) => (
                  <div key={row.adId} className="flex gap-4 rounded-md border border-[color:var(--color-border)] p-3">
                    <CreativeThumb row={row} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[color:var(--color-text-primary)]">{row.adName}</p>
                      <p className="mt-1 truncate text-xs text-[color:var(--color-text-muted)]">{row.campaignName}</p>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-[color:var(--color-text-muted)]">消化</p>
                          <p className="font-semibold">{yen(row.spend)}</p>
                        </div>
                        <div>
                          <p className="text-[color:var(--color-text-muted)]">リンク</p>
                          <p className="font-semibold">{num(row.inlineLinkClicks)}</p>
                        </div>
                        <div>
                          <p className="text-[color:var(--color-text-muted)]">LPC</p>
                          <p className="font-semibold">{row.inlineLinkClicks > 0 ? yen(row.lpc) : '—'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {topCreatives.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">この期間のクリエイティブデータがありません。</p>
                ) : null}
              </div>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'creative' && <ReelDropoffSection rows={reelAdRows} />}
    </div>
  );
}
