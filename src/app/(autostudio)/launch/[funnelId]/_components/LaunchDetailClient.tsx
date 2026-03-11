'use client';

import { useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { DashboardTabsInteractive } from '@/components/dashboard/DashboardTabsInteractive';
import { dashboardCardClass } from '@/components/dashboard/styles';
import { DeliveryTimeline } from '../../_components/DeliveryTimeline';
import { BroadcastDetail } from '../../_components/BroadcastDetail';
import { KpiDashboard } from './KpiDashboard';
import { KpiTab } from './KpiTab';
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
  tagMetrics: Record<string, number>;
}

// ------- Tabs -------

const TABS = [
  { id: 'kpi', label: 'KPI' },
  { id: 'kpi-settings', label: 'KPI設定' },
  { id: 'line-delivery', label: 'LINE配信' },
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

/** Parse date (YYYY-MM-DD) from Lステップ sent_at like "配信済み\n2026/02/26\n21:03" */
function parseDateFromSentAt(sentAt: string): string | null {
  const m = sentAt.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/** Parse time (HH:MM) from Lステップ sent_at like "配信済み\n2026/02/26\n21:03" */
function parseTimeFromSentAt(sentAt: string): string | null {
  const m = sentAt.match(/(\d{1,2}):(\d{2})\s*$/m);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/** Tokenize text into meaningful words for similarity matching */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[「」『』（）()【】[\]_:：、。…\s]+/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2)
  );
}

/** Count common tokens between two strings */
function tokenSimilarity(a: string, b: string): number {
  const tokA = tokenize(a);
  const tokB = tokenize(b);
  let count = 0;
  for (const t of tokA) {
    if (tokB.has(t)) count++;
  }
  return count;
}

/**
 * Match deliveries with broadcast metrics.
 * Strategy:
 * 1. Direct match via delivery.lstepBroadcastId (highest priority)
 * 2. Date-based matching with token similarity disambiguation (fallback)
 */
function matchDeliveriesWithMetrics(
  deliveries: DeliveryItem[],
  metrics: BroadcastMetric[],
  tagMetrics: Record<string, number>
): DeliveryWithMetrics[] {
  // Group metrics by broadcast_id
  const metricsByBroadcast = new Map<string, BroadcastMetric[]>();
  for (const m of metrics) {
    const existing = metricsByBroadcast.get(m.broadcast_id) || [];
    existing.push(m);
    metricsByBroadcast.set(m.broadcast_id, existing);
  }

  // Index broadcasts by date (for fallback matching)
  const broadcastsByDate = new Map<
    string,
    { broadcastId: string; name: string; time: string | null; series: BroadcastMetric[] }[]
  >();
  for (const [broadcastId, series] of metricsByBroadcast) {
    const dateStr = parseDateFromSentAt(series[0].sent_at);
    if (!dateStr) continue;
    const timeStr = parseTimeFromSentAt(series[0].sent_at);
    const existing = broadcastsByDate.get(dateStr) || [];
    existing.push({ broadcastId, name: series[0].broadcast_name, time: timeStr, series });
    broadcastsByDate.set(dateStr, existing);
  }

  const matched = new Set<string>();

  // Pass 1: Direct match via lstepBroadcastId
  const directMatches = new Map<number, { series: BroadcastMetric[]; broadcastId: string }>();
  deliveries.forEach((delivery, idx) => {
    if (delivery.lstepBroadcastId) {
      const series = metricsByBroadcast.get(delivery.lstepBroadcastId);
      if (series) {
        directMatches.set(idx, { series, broadcastId: delivery.lstepBroadcastId });
        matched.add(delivery.lstepBroadcastId);
      }
    }
  });

  // Pass 2: Date-based fallback for remaining deliveries
  return deliveries.map((delivery, idx) => {
    // clickTag → tag_metrics lookup, fallback to urlClicks sum
    let clickCount: number | undefined = delivery.clickTag
      ? tagMetrics[delivery.clickTag] ?? undefined
      : undefined;
    if (clickCount === undefined && delivery.urlClicks && delivery.urlClicks.length > 0) {
      clickCount = delivery.urlClicks.reduce((sum: number, u: { clicks?: number }) => sum + (u.clicks ?? 0), 0);
    }

    // Use direct match if available
    const direct = directMatches.get(idx);
    if (direct) {
      const sorted = [...direct.series].sort(
        (a, b) => a.elapsed_minutes - b.elapsed_minutes
      );
      return {
        ...delivery,
        latestMetric: sorted[sorted.length - 1],
        timeSeries: sorted,
        clickCount,
      };
    }

    // Skip date-based fallback for non-LINE deliveries (ig-*, th-*)
    const isLineBroadcast =
      !delivery.id.startsWith('ig-') && !delivery.id.startsWith('th-');

    // Fallback: date-based matching (LINE deliveries only)
    const candidates = isLineBroadcast
      ? broadcastsByDate
          .get(delivery.date)
          ?.filter((c) => !matched.has(c.broadcastId)) || []
      : [];

    let bestSeries: BroadcastMetric[] | null = null;
    let bestId: string | null = null;

    if (candidates.length === 1) {
      bestSeries = candidates[0].series;
      bestId = candidates[0].broadcastId;
    } else if (candidates.length > 1) {
      // Try token similarity first
      let bestScore = -1;
      for (const c of candidates) {
        const score = tokenSimilarity(delivery.title, c.name);
        if (score > bestScore) {
          bestScore = score;
          bestSeries = c.series;
          bestId = c.broadcastId;
        }
      }
      // If token match is weak, try time-based matching
      if (bestScore < 1 && delivery.time) {
        const timeMatch = candidates.find((c) => c.time === delivery.time);
        if (timeMatch) {
          bestSeries = timeMatch.series;
          bestId = timeMatch.broadcastId;
        } else {
          bestSeries = null;
          bestId = null;
        }
      } else if (bestScore < 1) {
        bestSeries = null;
        bestId = null;
      }
    }

    if (bestSeries && bestId) {
      matched.add(bestId);
      const sorted = [...bestSeries].sort(
        (a, b) => a.elapsed_minutes - b.elapsed_minutes
      );
      return {
        ...delivery,
        latestMetric: sorted[sorted.length - 1],
        timeSeries: sorted,
        clickCount,
      };
    }

    return { ...delivery, latestMetric: undefined, timeSeries: undefined, clickCount };
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

// Channel display config
const CHANNEL_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  line: { label: 'LINE', color: '#06C755', bg: '#06C75515', border: '#06C75540' },
  threads: { label: 'Threads', color: '#000000', bg: '#00000010', border: '#00000030' },
  instagram: { label: 'Instagram', color: '#E1306C', bg: '#E1306C15', border: '#E1306C40' },
};

// ------- Component -------

export function LaunchDetailClient({
  funnel,
  broadcastMetrics,
  tagMetrics,
}: LaunchDetailClientProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('kpi');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Match deliveries with metrics
  const deliveriesWithMetrics = useMemo(
    () => matchDeliveriesWithMetrics(funnel.deliveries, broadcastMetrics, tagMetrics),
    [funnel.deliveries, broadcastMetrics, tagMetrics]
  );

  // Segment map
  const segmentMap = useMemo(() => {
    const m = new Map<string, Segment>();
    funnel.segments.forEach((s) => m.set(s.id, s));
    return m;
  }, [funnel.segments]);

  // Extract unique channels from segments
  const availableChannels = useMemo(() => {
    const channels = new Map<string, number>();
    const segChannels = new Map<string, string>(); // segmentId -> channel
    for (const seg of funnel.segments) {
      const ch = seg.channel || 'line';
      segChannels.set(seg.id, ch);
    }
    // Count deliveries per channel
    for (const d of deliveriesWithMetrics) {
      const segIds = d.segmentIds || [d.segmentId];
      const dChannels = new Set(segIds.map((sid) => segChannels.get(sid) || 'line'));
      for (const ch of dChannels) {
        channels.set(ch, (channels.get(ch) || 0) + 1);
      }
    }
    return channels;
  }, [funnel.segments, deliveriesWithMetrics]);

  // Channel filter state — default to 'line' only
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(() => new Set(['line']));

  const toggleChannel = useCallback((ch: string) => {
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(ch)) {
        // Don't allow deselecting all
        if (next.size <= 1) return prev;
        next.delete(ch);
      } else {
        next.add(ch);
      }
      return next;
    });
  }, []);

  // Build segment→channel map for filtering
  const segmentChannelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const seg of funnel.segments) {
      m.set(seg.id, seg.channel || 'line');
    }
    return m;
  }, [funnel.segments]);

  // Channel-filtered deliveries
  const channelFilteredDeliveries = useMemo(() => {
    return deliveriesWithMetrics.filter((d) => {
      const segIds = d.segmentIds || [d.segmentId];
      return segIds.some((sid) => selectedChannels.has(segmentChannelMap.get(sid) || 'line'));
    });
  }, [deliveriesWithMetrics, selectedChannels, segmentChannelMap]);

  // Channel-filtered segments (for analysis tab dropdown)
  const channelFilteredSegments = useMemo(() => {
    return funnel.segments.filter((s) => selectedChannels.has(s.channel || 'line'));
  }, [funnel.segments, selectedChannels]);

  // Stats from channel-filtered deliveries
  const stats = useMemo(() => {
    let total = 0;
    let withMetrics = 0;
    let sumOpenRate = 0;
    let withClick = 0;
    let sumClickRate = 0;
    let firstDeliveryCount = 0;
    let lastDeliveryCount = 0;

    // Sort by date to find first/last
    const sorted = [...channelFilteredDeliveries].sort((a, b) => a.date.localeCompare(b.date));

    for (const d of sorted) {
      total++;
      if (d.latestMetric) {
        withMetrics++;
        sumOpenRate += d.latestMetric.open_rate;
        if (firstDeliveryCount === 0) firstDeliveryCount = d.latestMetric.delivery_count;
        lastDeliveryCount = d.latestMetric.delivery_count;
      }
      if (d.clickCount !== undefined && d.latestMetric && d.latestMetric.delivery_count > 0) {
        withClick++;
        sumClickRate += (d.clickCount / d.latestMetric.delivery_count) * 100;
      }
    }

    const avgOpenRate = withMetrics > 0 ? sumOpenRate / withMetrics : 0;
    const avgClickRate = withClick > 0 ? sumClickRate / withClick : 0;
    return { total, withMetrics, avgOpenRate, firstDeliveryCount, lastDeliveryCount, withClick, avgClickRate };
  }, [channelFilteredDeliveries]);

  const handleDeliveryClick = useCallback((d: DeliveryWithMetrics) => {
    setExpandedId((prev) => (prev === d.id ? null : d.id));
  }, []);

  const handleDeliveryDoubleClick = useCallback((d: DeliveryWithMetrics) => {
    setExpandedId(d.id);
    setActiveTab('analysis');
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  // Channel filter sub-component to avoid duplication
  const channelFilter = availableChannels.size > 1 ? (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-[color:var(--color-text-muted)]">チャネル:</span>
      <div className="flex flex-wrap gap-1.5">
        {Array.from(availableChannels.entries())
          .sort(([a], [b]) => {
            const order = ['line', 'threads', 'instagram'];
            return order.indexOf(a) - order.indexOf(b);
          })
          .map(([ch, count]) => {
            const config = CHANNEL_CONFIG[ch] || CHANNEL_CONFIG.line;
            const isSelected = selectedChannels.has(ch);
            return (
              <button
                key={ch}
                type="button"
                onClick={() => toggleChannel(ch)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all"
                style={{
                  color: isSelected ? config.color : 'var(--color-text-muted)',
                  backgroundColor: isSelected ? config.bg : 'transparent',
                  border: `1.5px solid ${isSelected ? config.border : 'var(--color-border)'}`,
                  opacity: isSelected ? 1 : 0.6,
                }}
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: isSelected ? config.color : 'var(--color-text-muted)' }}
                />
                {config.label} ({count})
              </button>
            );
          })}
      </div>
    </div>
  ) : null;

  return (
    <div className="launch-detail-wide flex flex-col gap-5 md:gap-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-[color:var(--color-text-muted)]">
          <Link href="/launch" className="hover:text-[color:var(--color-accent)] transition-colors">
            Launch
          </Link>
          <span>/</span>
          <span>{funnel.name}</span>
        </div>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
          <h1 className="text-xl font-bold text-[color:var(--color-text-primary)]">
            {funnel.name}
          </h1>
          <span className="text-xs text-[color:var(--color-text-muted)]">
            {formatDate(funnel.startDate)} - {formatDate(funnel.endDate)}
          </span>
        </div>
      </div>

      {/* Tabs - directly below header */}
      <DashboardTabsInteractive
        items={[...TABS]}
        value={activeTab}
        onChange={(v) => setActiveTab(v as TabKey)}
        aria-label="Launch タブ"
      />

      {/* Tab content */}
      {activeTab === 'kpi' && <KpiDashboard funnelId={funnel.id} startDate={funnel.startDate} endDate={funnel.endDate} baseDate={funnel.baseDate} />}
      {activeTab === 'kpi-settings' && <KpiTab funnelId={funnel.id} />}
      {activeTab === 'line-delivery' && (
        <>
          {/* Summary stats - 5 columns on desktop */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className={dashboardCardClass}>
              <p className="text-xs font-medium text-[color:var(--color-text-muted)]">配信数</p>
              <p className="mt-1 text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-[color:var(--color-text-muted)]">
                {stats.withMetrics} 件計測済み
              </p>
            </div>
            <div className={dashboardCardClass}>
              <p className="text-xs font-medium text-[color:var(--color-text-muted)]">
                配信数 (初回→最終)
              </p>
              <p className="mt-1 text-2xl font-bold">
                {stats.firstDeliveryCount > 0
                  ? `${numberFormatter.format(stats.firstDeliveryCount)}→${numberFormatter.format(stats.lastDeliveryCount)}`
                  : '-'}
              </p>
              <p className="text-xs text-[color:var(--color-text-muted)]">
                {stats.firstDeliveryCount > 0 && stats.lastDeliveryCount !== stats.firstDeliveryCount
                  ? `${stats.lastDeliveryCount > stats.firstDeliveryCount ? '+' : ''}${numberFormatter.format(stats.lastDeliveryCount - stats.firstDeliveryCount)}人`
                  : '計測データなし'}
              </p>
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
                平均クリック率
              </p>
              <p
                className="mt-1 text-2xl font-bold"
                style={{
                  color: stats.avgClickRate > 0 ? '#2563EB' : undefined,
                }}
              >
                {stats.avgClickRate > 0
                  ? `${percentFormatter.format(stats.avgClickRate)}%`
                  : '-'}
              </p>
              <p className="text-xs text-[color:var(--color-text-muted)]">
                {stats.withClick > 0 ? `${stats.withClick}件の平均` : 'CTA配信なし'}
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
                    className="inline-flex items-center rounded px-1 text-[10px] font-medium leading-4"
                    style={{
                      color: s.color,
                      backgroundColor: `${s.color}18`,
                      border: `1px solid ${s.color}40`,
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

          {/* Channel filter */}
          {channelFilter}

          <OverviewTab
            deliveries={channelFilteredDeliveries}
            segments={channelFilteredSegments}
            startDate={funnel.startDate}
            endDate={funnel.endDate}
            onDeliveryClick={handleDeliveryClick}
            onDeliveryDoubleClick={handleDeliveryDoubleClick}
            selectedDeliveryId={expandedId}
          />
        </>
      )}
      {activeTab === 'analysis' && (
        <>
          {/* Channel filter */}
          {channelFilter}

          <AnalysisTab
            deliveries={channelFilteredDeliveries}
            segments={channelFilteredSegments}
            segmentMap={segmentMap}
            expandedId={expandedId}
            onToggle={toggleExpand}
          />
        </>
      )}
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
  onDeliveryDoubleClick,
  selectedDeliveryId,
}: {
  deliveries: DeliveryWithMetrics[];
  segments: Segment[];
  startDate: string;
  endDate: string;
  onDeliveryClick: (d: DeliveryWithMetrics) => void;
  onDeliveryDoubleClick: (d: DeliveryWithMetrics) => void;
  selectedDeliveryId: string | null;
}) {
  return (
    <>
      <Card>
        <div className="p-3 md:p-4">
          <DeliveryTimeline
            deliveries={deliveries}
            segments={segments}
            startDate={startDate}
            endDate={endDate}
            onDeliveryClick={onDeliveryClick}
            onDeliveryDoubleClick={onDeliveryDoubleClick}
            selectedDeliveryId={selectedDeliveryId}
          />
        </div>
      </Card>
    </>
  );
}

// ------- Analysis Tab -------

function AnalysisTab({
  deliveries,
  segments,
  segmentMap,
  expandedId,
  onToggle,
}: {
  deliveries: DeliveryWithMetrics[];
  segments: Segment[];
  segmentMap: Map<string, Segment>;
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  const [segmentFilter, setSegmentFilter] = useState<string>('all');

  // Sort deliveries by date, then filter by segment
  const filtered = useMemo(() => {
    const sorted = [...deliveries].sort((a, b) => a.date.localeCompare(b.date));
    if (segmentFilter === 'all') return sorted;
    return sorted.filter((d) => {
      const ids = d.segmentIds || [d.segmentId];
      return ids.includes(segmentFilter);
    });
  }, [deliveries, segmentFilter]);

  // Group by date
  const grouped = useMemo(() => {
    const map = new Map<string, DeliveryWithMetrics[]>();
    for (const d of filtered) {
      const existing = map.get(d.date) || [];
      existing.push(d);
      map.set(d.date, existing);
    }
    return map;
  }, [filtered]);

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[color:var(--color-text-muted)]">
          配信をクリックでプレビュー・開封率を確認
        </p>
        <select
          value={segmentFilter}
          onChange={(e) => setSegmentFilter(e.target.value)}
          className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-1.5 text-xs"
        >
          <option value="all">全セグメント ({deliveries.length})</option>
          {segments.map((s) => {
            const count = deliveries.filter((d) => {
              const ids = d.segmentIds || [d.segmentId];
              return ids.includes(s.id);
            }).length;
            return (
              <option key={s.id} value={s.id}>
                {s.name} ({count})
              </option>
            );
          })}
        </select>
      </div>

      {/* Grouped delivery list */}
      {Array.from(grouped.entries()).map(([date, items]) => (
        <div key={date} className="flex flex-col gap-1.5">
          {/* Date header */}
          <div className="sticky top-0 z-10 flex items-center gap-2 bg-[color:var(--color-background)] py-1">
            <span className="text-xs font-semibold text-[color:var(--color-text-secondary)]">
              {formatDate(date).slice(5)}
            </span>
            <span className="text-[10px] text-[color:var(--color-text-muted)]">
              {items.length}件
            </span>
            <div className="h-px flex-1 bg-[color:var(--color-border)]" />
          </div>

          {items.map((delivery) => {
            const isExpanded = expandedId === delivery.id;
            const openRate = delivery.latestMetric?.open_rate;
            const itemSegments = (delivery.segmentIds || [delivery.segmentId])
              .map((sid) => segmentMap.get(sid))
              .filter(Boolean) as Segment[];

            return (
              <div
                key={delivery.id}
                className="overflow-hidden rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface)]"
              >
                <button
                  type="button"
                  onClick={() => onToggle(delivery.id)}
                  aria-expanded={isExpanded}
                  className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-[color:var(--color-surface-muted)] sm:gap-3 sm:px-4 sm:py-3"
                >
                  {/* Expand chevron */}
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    aria-hidden="true"
                    className="shrink-0 transition-transform"
                    style={{ transform: isExpanded ? 'rotate(90deg)' : undefined }}
                  >
                    <path
                      d="M6 4L10 8L6 12"
                      stroke="currentColor"
                      className="text-[color:var(--color-text-muted)]"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>

                  {/* Type icon */}
                  <span className="shrink-0 text-sm">
                    {TYPE_ICONS[delivery.type] || '\u2709\uFE0F'}
                  </span>

                  {/* Title */}
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[color:var(--color-text-primary)]">
                    {delivery.title}
                  </span>

                  {/* Segment badges - hidden on mobile */}
                  <div className="hidden shrink-0 gap-1.5 sm:flex">
                    {itemSegments.slice(0, 2).map((seg) => (
                      <span
                        key={seg.id}
                        className="inline-flex items-center rounded px-1 text-[10px] font-medium leading-4"
                        style={{
                          color: seg.color,
                          backgroundColor: `${seg.color}18`,
                          border: `1px solid ${seg.color}40`,
                        }}
                      >
                        {seg.name}
                      </span>
                    ))}
                  </div>

                  {/* Metrics badges */}
                  <div className="flex shrink-0 items-center gap-1.5">
                    {openRate !== undefined ? (
                      <span
                        className="rounded px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          color: getOpenRateColor(openRate),
                          backgroundColor: getOpenRateBgColor(openRate),
                        }}
                      >
                        {openRate.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-[color:var(--color-text-muted)]">
                        -
                      </span>
                    )}
                    {delivery.clickCount !== undefined && delivery.clickCount > 0 && (
                      <span
                        className="rounded px-2 py-0.5 text-[11px] font-semibold"
                        style={{
                          color: '#2563EB',
                          backgroundColor: '#DBEAFE',
                        }}
                        title={`クリック ${delivery.clickCount}人`}
                      >
                        {delivery.latestMetric && delivery.latestMetric.delivery_count > 0
                          ? `${((delivery.clickCount / delivery.latestMetric.delivery_count) * 100).toFixed(1)}%`
                          : `${delivery.clickCount}人`}
                      </span>
                    )}
                  </div>

                  {/* Delivery count */}
                  {delivery.latestMetric && (
                    <span className="hidden w-14 shrink-0 text-right text-[11px] text-[color:var(--color-text-secondary)] sm:inline">
                      {numberFormatter.format(delivery.latestMetric.delivery_count)}通
                    </span>
                  )}
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-4 py-4 sm:px-5">
                    <BroadcastDetail delivery={delivery} allDeliveries={deliveries} segments={segments} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="flex items-center justify-center py-12 text-sm text-[color:var(--color-text-muted)]">
          {segmentFilter === 'all' ? '配信データがありません' : 'このセグメントの配信はありません'}
        </div>
      )}
    </div>
  );
}
