'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { DashboardDateRangePicker } from '@/components/dashboard/DashboardDateRangePicker';
import { DashboardTabsInteractive } from '@/components/dashboard/DashboardTabsInteractive';
import { dashboardCardClass } from '@/components/dashboard/styles';
import type { AdsByAdRow, AdsDashboardData, AdsDailyPoint } from '@/lib/ads/bigquery';
import type { ReelAdInsightRow } from '@/lib/ads/reelInsights';
import { ReelDropoffSection } from './ReelDropoffSection';

interface AdsDashboardShellProps {
  rangeOptions: Array<{ value: string; label: string }>;
  selectedRange: string;
  period: { start: string; end: string };
  data: AdsDashboardData;
  reelAdRows: ReelAdInsightRow[];
}

type AdsTabKey = 'home' | 'creative' | 'detail';

const ADS_TAB_ITEMS: Array<{ id: AdsTabKey; label: string }> = [
  { id: 'home', label: 'ホーム' },
  { id: 'creative', label: 'クリエイティブ' },
  { id: 'detail', label: 'パフォーマンス詳細' },
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

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className={dashboardCardClass}>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--color-text-muted)]">{label}</p>
      <p className="mt-2 text-xl font-semibold text-[color:var(--color-text-primary)]">{value}</p>
      {sub ? <p className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">{sub}</p> : null}
    </div>
  );
}

function FunnelVisual({
  impressions,
  clicks,
  lpClicks,
  lineRegistrations,
}: {
  impressions: number;
  clicks: number;
  lpClicks: number;
  lineRegistrations: number;
}) {
  const steps = [
    { label: 'インプレッション', value: impressions, color: 'rgba(10,122,255,0.85)' },
    { label: '広告リンクCK', value: clicks, color: 'rgba(10,122,255,0.65)' },
    { label: 'LP内LINE CK', value: lpClicks, color: 'rgba(255,176,32,0.85)' },
    { label: 'LINE登録', value: lineRegistrations, color: 'rgba(25,195,125,0.85)' },
  ];
  const max = Math.max(...steps.map((s) => s.value), 1);
  return (
    <Card className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">ファネル可視化</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">imp → クリック → LP → LINE登録の歩留まり</p>
      </div>
      <div className="space-y-2">
        {steps.map((step, idx) => {
          const ratio = step.value / max;
          const prev = idx > 0 ? steps[idx - 1].value : null;
          const dropRate = prev !== null && prev > 0 ? (step.value / prev) * 100 : null;
          return (
            <div key={step.label} className="flex items-center gap-3">
              <span className="w-32 shrink-0 text-xs text-[color:var(--color-text-secondary)]">{step.label}</span>
              <div className="relative h-8 flex-1 overflow-hidden rounded bg-[color:var(--color-surface-muted)]">
                <div
                  className="absolute inset-y-0 left-0 flex items-center justify-end px-3 text-xs font-semibold text-white"
                  style={{ width: `${Math.max(2, ratio * 100)}%`, backgroundColor: step.color }}
                >
                  {num(step.value)}
                </div>
              </div>
              <span className="w-20 shrink-0 text-right text-xs text-[color:var(--color-text-muted)] tabular-nums">
                {dropRate !== null ? `→ ${dropRate.toFixed(1)}%` : ''}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function PeriodCompareCollapsed({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">期間別ファネル比較</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">2つの期間のパフォーマンスを比較して改善点を発見します</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-md bg-[color:var(--color-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          {open ? '閉じる' : '期間を比較する'}
        </button>
      </div>
      {open && (
        <div className="mt-4 rounded-md border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-text-muted)]">
          期間比較機能は近日実装予定です
        </div>
      )}
    </Card>
  );
}

function DailyTable({ daily }: { daily: AdsDailyPoint[] }) {
  if (daily.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">日別パフォーマンス</h2>
        <p className="py-8 text-center text-sm text-[color:var(--color-text-muted)]">この期間のデータがありません</p>
      </Card>
    );
  }
  const sorted = [...daily].reverse();
  return (
    <Card className="p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">日別パフォーマンス</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">日付ごとの消化金額・成果指標を一覧</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-text-muted)]">
              <th className="py-2 pr-3 font-medium">日付</th>
              <th className="py-2 px-3 font-medium text-right">消化金額</th>
              <th className="py-2 px-3 font-medium text-right">imp</th>
              <th className="py-2 px-3 font-medium text-right">クリック</th>
              <th className="py-2 px-3 font-medium text-right">CTR</th>
              <th className="py-2 px-3 font-medium text-right">Meta Lead</th>
              <th className="py-2 px-3 font-medium text-right">CPA</th>
              <th className="py-2 pl-3 font-medium text-right">CVR</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const ctr = row.impressions > 0 ? row.inlineLinkClicks / row.impressions : 0;
              const cpa = row.leads > 0 ? row.spend / row.leads : null;
              const cvr = row.inlineLinkClicks > 0 ? row.leads / row.inlineLinkClicks : null;
              return (
                <tr key={row.date} className="border-b border-[color:var(--color-border)] last:border-0">
                  <td className="py-2 pr-3 font-medium text-[color:var(--color-text-primary)]">{row.date}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{yen(row.spend)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{num(row.impressions)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{num(row.inlineLinkClicks)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{pct(ctr)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{num(row.leads)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{cpa !== null ? yen(cpa) : '—'}</td>
                  <td className="py-2 pl-3 text-right tabular-nums">{cvr !== null ? pct(cvr) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function TopCreativeCard({ row }: { row: AdsByAdRow }) {
  const ctr = row.impressions > 0 ? row.inlineLinkClicks / row.impressions : 0;
  const cpa = row.leads > 0 ? row.spend / row.leads : null;
  const cvr = row.inlineLinkClicks > 0 ? row.leads / row.inlineLinkClicks : null;
  const imageUrl = row.imageUrl || row.thumbnailUrl;
  return (
    <div className="flex flex-col rounded-md border border-[color:var(--color-border)] bg-white p-3">
      <div className="relative mx-auto aspect-[9/16] w-full max-w-[160px] overflow-hidden rounded-md bg-[color:var(--color-surface-muted)]">
        {imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={imageUrl} alt={row.adName} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-[color:var(--color-text-muted)]">No image</div>
        )}
        <div className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {mediaLabel(row.mediaType)}
        </div>
      </div>
      <p className="mt-2 truncate text-sm font-medium text-[color:var(--color-text-primary)]" title={row.adName}>
        {row.adName}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
        <div className="text-[color:var(--color-text-muted)]">消化</div>
        <div className="text-right font-semibold tabular-nums">{yen(row.spend)}</div>
        <div className="text-[color:var(--color-text-muted)]">imp</div>
        <div className="text-right font-semibold tabular-nums">{num(row.impressions)}</div>
        <div className="text-[color:var(--color-text-muted)]">CTR</div>
        <div className="text-right font-semibold tabular-nums">{pct(ctr)}</div>
        <div className="text-[color:var(--color-text-muted)]">LINE</div>
        <div className="text-right font-semibold tabular-nums">{num(row.leads)}</div>
        <div className="text-[color:var(--color-text-muted)]">CPA</div>
        <div className="text-right font-semibold tabular-nums">{cpa !== null ? yen(cpa) : '—'}</div>
        <div className="text-[color:var(--color-text-muted)]">CVR</div>
        <div className="text-right font-semibold tabular-nums">{cvr !== null ? pct(cvr) : '—'}</div>
      </div>
    </div>
  );
}

function PerformanceDetail({ byAd, daily }: { byAd: AdsByAdRow[]; daily: AdsDailyPoint[] }) {
  const [selectedAdId, setSelectedAdId] = useState<string | null>(byAd[0]?.adId ?? null);
  const selected = byAd.find((r) => r.adId === selectedAdId) ?? null;
  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">パフォーマンス詳細</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">クリエイティブを選択して詳細データを確認</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {byAd.slice(0, 30).map((row) => (
            <button
              key={row.adId}
              type="button"
              onClick={() => setSelectedAdId(row.adId)}
              className={`rounded-md border px-3 py-1.5 text-xs ${
                selectedAdId === row.adId
                  ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)] text-white'
                  : 'border-[color:var(--color-border)] text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-surface-muted)]'
              }`}
            >
              {row.adName}
            </button>
          ))}
        </div>
      </Card>
      {selected && (
        <Card className="p-6">
          <div className="flex gap-4">
            <div className="shrink-0">
              {(selected.imageUrl || selected.thumbnailUrl) && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={selected.imageUrl || selected.thumbnailUrl || ''} alt={selected.adName} className="aspect-[9/16] w-32 rounded-md object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">{selected.adName}</h3>
              <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">{selected.campaignName} / {selected.adsetName}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div><div className="text-xs text-[color:var(--color-text-muted)]">消化</div><div className="font-semibold">{yen(selected.spend)}</div></div>
                <div><div className="text-xs text-[color:var(--color-text-muted)]">imp</div><div className="font-semibold">{num(selected.impressions)}</div></div>
                <div><div className="text-xs text-[color:var(--color-text-muted)]">クリック</div><div className="font-semibold">{num(selected.inlineLinkClicks)}</div></div>
                <div><div className="text-xs text-[color:var(--color-text-muted)]">CTR</div><div className="font-semibold">{pct(selected.inlineLinkCtr)}</div></div>
                <div><div className="text-xs text-[color:var(--color-text-muted)]">CPM</div><div className="font-semibold">{yen(selected.cpm)}</div></div>
                <div><div className="text-xs text-[color:var(--color-text-muted)]">CPC</div><div className="font-semibold">{yen(selected.cpc)}</div></div>
                <div><div className="text-xs text-[color:var(--color-text-muted)]">LPC</div><div className="font-semibold">{selected.inlineLinkClicks > 0 ? yen(selected.lpc) : '—'}</div></div>
                <div><div className="text-xs text-[color:var(--color-text-muted)]">CPA</div><div className="font-semibold">{selected.leads > 0 ? yen(selected.metaLeadCpa) : '—'}</div></div>
              </div>
            </div>
          </div>
        </Card>
      )}
      <DailyTable daily={daily} />
    </div>
  );
}

export function AdsDashboardShell({ rangeOptions, selectedRange, period, data, reelAdRows }: AdsDashboardShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<AdsTabKey>('home');
  const [periodCompareOpen, setPeriodCompareOpen] = useState(false);

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

  const topCreatives = useMemo(() => data.byAd.slice(0, 3), [data.byAd]);

  const summary = data.summary;
  const ctr = summary.inlineLinkCtr;
  const lineCvr = summary.inlineLinkClicks > 0 ? summary.lineRegistrations / summary.inlineLinkClicks : null;
  const lpCvr = summary.launchkitLineClicks > 0 ? summary.lineRegistrations / summary.launchkitLineClicks : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <DashboardTabsInteractive
          items={ADS_TAB_ITEMS}
          value={activeTab}
          onChange={(value) => setActiveTab(value as AdsTabKey)}
          className="flex-1 min-w-[260px]"
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
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">主要指標</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="消化金額" value={yen(summary.spend)} />
              <KpiCard label="インプレッション" value={num(summary.impressions)} />
              <KpiCard label="広告リンククリック" value={num(summary.inlineLinkClicks)} sub={`CTR ${pct(ctr)}`} />
              <KpiCard label="LINE登録(全流入)" value={num(summary.lineRegistrations)} />
            </div>
            <h2 className="mt-6 text-lg font-semibold text-[color:var(--color-text-primary)]">補助指標</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="CPM" value={yen(summary.cpm)} />
              <KpiCard label="CPC" value={yen(summary.cpc)} />
              <KpiCard label="META LEAD CPA" value={summary.leads > 0 ? yen(summary.metaLeadCpa) : '—'} />
              <KpiCard label="LINE CPA(全流入)" value={summary.lineRegistrations > 0 ? yen(summary.lineCpa) : '—'} />
              <KpiCard label="広告LPC" value={yen(summary.lpc)} />
              <KpiCard label="LP内LINE CK率" value={pct(summary.lineClickRate)} />
              <KpiCard label="LP CVR" value={lpCvr !== null ? pct(lpCvr) : '—'} sub="LP内LINE CK→登録" />
              <KpiCard label="全体CVR" value={lineCvr !== null ? pct(lineCvr) : '—'} sub="リンクCK→登録" />
            </div>
          </Card>

          <DailyTable daily={data.daily} />

          <FunnelVisual
            impressions={summary.impressions}
            clicks={summary.inlineLinkClicks}
            lpClicks={summary.launchkitLineClicks}
            lineRegistrations={summary.lineRegistrations}
          />

          <PeriodCompareCollapsed open={periodCompareOpen} onToggle={() => setPeriodCompareOpen((p) => !p)} />

          <Card className="p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">上位クリエイティブ TOP3</h2>
              <button
                type="button"
                onClick={() => setActiveTab('creative')}
                className="text-sm font-medium text-[color:var(--color-accent)] hover:underline"
              >
                すべて見る →
              </button>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {topCreatives.map((row) => (
                <TopCreativeCard key={row.adId} row={row} />
              ))}
              {topCreatives.length === 0 && (
                <p className="col-span-3 py-8 text-center text-sm text-[color:var(--color-text-muted)]">この期間のクリエイティブデータがありません</p>
              )}
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'creative' && <ReelDropoffSection rows={reelAdRows} />}
      {activeTab === 'detail' && <PerformanceDetail byAd={data.byAd} daily={data.daily} />}
    </div>
  );
}
