'use client';

import { useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { DashboardTabsInteractive } from '@/components/dashboard/DashboardTabsInteractive';
import { dashboardCardClass } from '@/components/dashboard/styles';
import { DeliveryTimeline } from '../../_components/DeliveryTimeline';
import { BroadcastDetail } from '../../_components/BroadcastDetail';
import type {
  FunnelData,
  BroadcastMetric,
  DeliveryWithMetrics,
  DeliveryItem,
  Segment,
} from '@/types/launch';

// ------- Types -------

interface LaunchDetailClientProps {
  funnel: FunnelData;
  broadcastMetrics: BroadcastMetric[];
}

// ------- Tabs -------

const TABS = [
  { id: 'overview', label: '概要' },
  { id: 'analysis', label: '配信分析' },
] as const;

type TabKey = (typeof TABS)[number]['id'];

// ------- Helpers -------

const numberFormatter = new Intl.NumberFormat('ja-JP');
const percentFormatter = new Intl.NumberFormat('ja-JP', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    return `${y}/${m}/${d}`;
  } catch {
    return dateStr;
  }
}

/** Fuzzy match: delivery title includes broadcast_name or vice versa */
function fuzzyMatch(deliveryTitle: string, broadcastName: string): boolean {
  const a = deliveryTitle.toLowerCase().replace(/\s+/g, '');
  const b = broadcastName.toLowerCase().replace(/\s+/g, '');
  return a.includes(b) || b.includes(a);
}

/** Match deliveries with broadcast metrics */
function matchDeliveriesWithMetrics(
  deliveries: DeliveryItem[],
  metrics: BroadcastMetric[]
): DeliveryWithMetrics[] {
  // Group metrics by broadcast_name
  const metricsByName = new Map<string, BroadcastMetric[]>();
  for (const m of metrics) {
    const key = m.broadcast_name.toLowerCase().replace(/\s+/g, '');
    const existing = metricsByName.get(key) || [];
    existing.push(m);
    metricsByName.set(key, existing);
  }

  return deliveries.map((delivery) => {
    // Try to find matching metrics
    let matchedSeries: BroadcastMetric[] = [];

    for (const [key, series] of metricsByName.entries()) {
      if (fuzzyMatch(delivery.title, series[0].broadcast_name)) {
        matchedSeries = series;
        break;
      }
    }

    // Sort by elapsed_minutes
    const sorted = [...matchedSeries].sort(
      (a, b) => a.elapsed_minutes - b.elapsed_minutes
    );

    // Latest is the one with most elapsed time
    const latest = sorted.length > 0 ? sorted[sorted.length - 1] : undefined;

    return {
      ...delivery,
      latestMetric: latest,
      timeSeries: sorted.length > 0 ? sorted : undefined,
    };
  });
}

// Type icons
const TYPE_ICONS: Record<string, string> = {
  message: '\u2709\uFE0F',
  video: '\uD83C\uDFA5',
  sale: '\uD83D\uDCB0',
  reminder: '\u23F0',
  branch: '\uD83D\uDD00',
};

const TYPE_LABELS: Record<string, string> = {
  message: 'メッセージ',
  video: '動画',
  sale: 'セール',
  reminder: 'リマインダー',
  branch: '分岐',
};

function getOpenRateColor(rate: number): string {
  if (rate >= 40) return '#16A34A';
  if (rate >= 20) return '#CA8A04';
  return '#DC2626';
}

function getOpenRateBgColor(rate: number): string {
  if (rate >= 40) return '#DCFCE7';
  if (rate >= 20) return '#FEF9C3';
  return '#FEE2E2';
}

// ------- Component -------

export function LaunchDetailClient({
  funnel,
  broadcastMetrics,
}: LaunchDetailClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Match deliveries with metrics
  const deliveriesWithMetrics = useMemo(
    () => matchDeliveriesWithMetrics(funnel.deliveries, broadcastMetrics),
    [funnel.deliveries, broadcastMetrics]
  );

  // Segment map
  const segmentMap = useMemo(() => {
    const m = new Map<string, Segment>();
    funnel.segments.forEach((s) => m.set(s.id, s));
    return m;
  }, [funnel.segments]);

  // Stats (single-pass calculation)
  const stats = useMemo(() => {
    let total = 0;
    let withMetrics = 0;
    let sumOpenRate = 0;
    let totalSent = 0;

    for (const d of deliveriesWithMetrics) {
      total++;
      if (d.latestMetric) {
        withMetrics++;
        sumOpenRate += d.latestMetric.open_rate;
        totalSent += d.latestMetric.delivery_count;
      }
    }

    const avgOpenRate = withMetrics > 0 ? sumOpenRate / withMetrics : 0;
    return { total, withMetrics, avgOpenRate, totalSent };
  }, [deliveriesWithMetrics]);

  const handleDeliveryClick = useCallback((d: DeliveryWithMetrics) => {
    setExpandedId((prev) => (prev === d.id ? null : d.id));
    setActiveTab('analysis');
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  return (
    <div className="section-stack">
      {/* Header */}
      <div className="flex flex-col gap-3 px-6">
        <div className="flex items-center gap-2 text-sm text-[color:var(--color-text-muted)]">
          <Link href="/line" className="hover:text-[color:var(--color-accent)] transition-colors">
            LINE
          </Link>
          <span>/</span>
          <span>Launch</span>
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <h1 className="text-xl font-bold text-[color:var(--color-text-primary)]">
            {funnel.name}
          </h1>
          <span className="text-xs text-[color:var(--color-text-muted)]">
            {formatDate(funnel.startDate)} - {formatDate(funnel.endDate)}
          </span>
        </div>
        {funnel.description && (
          <p className="text-sm text-[color:var(--color-text-secondary)]">
            {funnel.description}
          </p>
        )}
      </div>

      {/* Summary stats */}
      <div className="px-6">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: 12,
          }}
        >
          <div className={dashboardCardClass}>
            <p className="text-xs font-medium text-[color:var(--color-text-muted)]">配信数</p>
            <p className="mt-1 text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-[color:var(--color-text-muted)]">
              {stats.withMetrics} 件計測済み
            </p>
          </div>
          <div className={dashboardCardClass}>
            <p className="text-xs font-medium text-[color:var(--color-text-muted)]">
              合計配信リーチ
            </p>
            <p className="mt-1 text-2xl font-bold">
              {numberFormatter.format(stats.totalSent)}
            </p>
            <p className="text-xs text-[color:var(--color-text-muted)]">通</p>
          </div>
          <div className={dashboardCardClass}>
            <p className="text-xs font-medium text-[color:var(--color-text-muted)]">
              平均開封率
            </p>
            <p
              className="mt-1 text-2xl font-bold"
              style={{
                color: stats.avgOpenRate > 0 ? getOpenRateColor(stats.avgOpenRate) : undefined,
              }}
            >
              {stats.avgOpenRate > 0
                ? `${percentFormatter.format(stats.avgOpenRate)}%`
                : '-'}
            </p>
            <p className="text-xs text-[color:var(--color-text-muted)]">
              {stats.withMetrics > 0 ? `${stats.withMetrics}件の平均` : '計測データなし'}
            </p>
          </div>
          <div className={dashboardCardClass}>
            <p className="text-xs font-medium text-[color:var(--color-text-muted)]">
              セグメント数
            </p>
            <p className="mt-1 text-2xl font-bold">{funnel.segments.length}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {funnel.segments.slice(0, 4).map((s) => (
                <span
                  key={s.id}
                  style={{
                    fontSize: 9,
                    fontWeight: 500,
                    color: s.color,
                    backgroundColor: `${s.color}18`,
                    border: `1px solid ${s.color}40`,
                    borderRadius: 3,
                    padding: '0 4px',
                    lineHeight: '16px',
                  }}
                >
                  {s.name}
                </span>
              ))}
              {funnel.segments.length > 4 && (
                <span className="text-xs text-[color:var(--color-text-muted)]">
                  +{funnel.segments.length - 4}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6">
        <DashboardTabsInteractive
          items={[...TABS]}
          value={activeTab}
          onChange={(v) => setActiveTab(v as TabKey)}
          aria-label="Launch タブ"
        />
      </div>

      {/* Tab content */}
      <div className="px-6">
        {activeTab === 'overview' && (
          <OverviewTab
            deliveries={deliveriesWithMetrics}
            segments={funnel.segments}
            startDate={funnel.startDate}
            endDate={funnel.endDate}
            onDeliveryClick={handleDeliveryClick}
          />
        )}
        {activeTab === 'analysis' && (
          <AnalysisTab
            deliveries={deliveriesWithMetrics}
            segmentMap={segmentMap}
            expandedId={expandedId}
            onToggle={toggleExpand}
          />
        )}
      </div>
    </div>
  );
}

// ------- Overview Tab -------

function OverviewTab({
  deliveries,
  segments,
  startDate,
  endDate,
  onDeliveryClick,
}: {
  deliveries: DeliveryWithMetrics[];
  segments: Segment[];
  startDate: string;
  endDate: string;
  onDeliveryClick: (d: DeliveryWithMetrics) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="p-4">
          <h2 className="mb-4 text-sm font-semibold text-[color:var(--color-text-primary)]">
            配信タイムライン
          </h2>
          <DeliveryTimeline
            deliveries={deliveries}
            segments={segments}
            startDate={startDate}
            endDate={endDate}
            onDeliveryClick={onDeliveryClick}
          />
        </div>
      </Card>
    </div>
  );
}

// ------- Analysis Tab -------

function AnalysisTab({
  deliveries,
  segmentMap,
  expandedId,
  onToggle,
}: {
  deliveries: DeliveryWithMetrics[];
  segmentMap: Map<string, Segment>;
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  // Sort deliveries by date
  const sorted = useMemo(
    () => [...deliveries].sort((a, b) => a.date.localeCompare(b.date)),
    [deliveries]
  );

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-[color:var(--color-text-muted)]">
        各配信をクリックすると、LINEメッセージプレビューと開封率推移を確認できます。
      </p>

      {sorted.map((delivery) => {
        const isExpanded = expandedId === delivery.id;
        const openRate = delivery.latestMetric?.open_rate;
        const itemSegments = (delivery.segmentIds || [delivery.segmentId])
          .map((sid) => segmentMap.get(sid))
          .filter(Boolean) as Segment[];

        return (
          <div key={delivery.id} className="rounded-lg border border-[color:var(--color-border)] bg-white overflow-hidden">
            {/* Row header */}
            <button
              type="button"
              onClick={() => onToggle(delivery.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
            >
              {/* Expand chevron */}
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                style={{
                  transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s',
                  flexShrink: 0,
                }}
              >
                <path
                  d="M6 4L10 8L6 12"
                  stroke="#9CA3AF"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              {/* Type icon */}
              <span style={{ fontSize: 14, flexShrink: 0 }}>
                {TYPE_ICONS[delivery.type] || '\u2709\uFE0F'}
              </span>

              {/* Date */}
              <span
                style={{
                  fontSize: 11,
                  color: '#6B7280',
                  fontWeight: 500,
                  width: 50,
                  flexShrink: 0,
                }}
              >
                {formatDate(delivery.date).slice(5)}
              </span>

              {/* Title */}
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#111',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {delivery.title}
              </span>

              {/* Segment badges */}
              <div
                style={{
                  display: 'flex',
                  gap: 3,
                  flexShrink: 0,
                }}
              >
                {itemSegments.slice(0, 2).map((seg) => (
                  <span
                    key={seg.id}
                    style={{
                      fontSize: 9,
                      fontWeight: 500,
                      color: seg.color,
                      backgroundColor: `${seg.color}18`,
                      border: `1px solid ${seg.color}40`,
                      borderRadius: 3,
                      padding: '0 4px',
                      lineHeight: '16px',
                    }}
                  >
                    {seg.name}
                  </span>
                ))}
              </div>

              {/* Metrics badge */}
              {openRate !== undefined ? (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: getOpenRateColor(openRate),
                    backgroundColor: getOpenRateBgColor(openRate),
                    borderRadius: 4,
                    padding: '2px 8px',
                    flexShrink: 0,
                  }}
                >
                  {openRate.toFixed(1)}%
                </span>
              ) : (
                <span
                  style={{
                    fontSize: 10,
                    color: '#9CA3AF',
                    flexShrink: 0,
                  }}
                >
                  -
                </span>
              )}

              {/* Delivery count */}
              {delivery.latestMetric && (
                <span
                  style={{
                    fontSize: 11,
                    color: '#6B7280',
                    flexShrink: 0,
                    width: 60,
                    textAlign: 'right',
                  }}
                >
                  {numberFormatter.format(delivery.latestMetric.delivery_count)}通
                </span>
              )}
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div
                style={{
                  borderTop: '1px solid #E5E7EB',
                  padding: '16px 20px',
                  backgroundColor: '#FAFAFA',
                }}
              >
                <BroadcastDetail delivery={delivery} />
              </div>
            )}
          </div>
        );
      })}

      {sorted.length === 0 && (
        <div className="flex items-center justify-center py-12 text-sm text-[color:var(--color-text-muted)]">
          配信データがありません
        </div>
      )}
    </div>
  );
}
