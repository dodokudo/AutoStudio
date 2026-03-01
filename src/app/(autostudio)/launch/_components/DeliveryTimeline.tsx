'use client';

import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { DeliveryWithMetrics, Segment, BroadcastMetric } from '@/types/launch';
import { LineMessagePreview } from './LineMessagePreview';

const BASE_COL_WIDTH = 200;
const PREVIEW_NATIVE_WIDTH = 280;

// Open rate color thresholds
function getOpenRateColor(rate: number | undefined): string {
  if (rate === undefined) return 'var(--color-text-muted)';
  if (rate >= 40) return '#16A34A';
  if (rate >= 20) return '#CA8A04';
  return '#DC2626';
}

interface DeliveryTimelineProps {
  deliveries: DeliveryWithMetrics[];
  segments: Segment[];
  startDate: string;
  endDate: string;
  onDeliveryClick?: (delivery: DeliveryWithMetrics) => void;
  onDeliveryDoubleClick?: (delivery: DeliveryWithMetrics) => void;
  selectedDeliveryId?: string | null;
  inlineExpandedIds?: Set<string>;
}

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(dateStr: string): string {
  const d = parseDate(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatWeekday(dateStr: string): string {
  const d = parseDate(dateStr);
  return ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
}

function daysBetween(a: string, b: string): number {
  const da = parseDate(a);
  const db = parseDate(b);
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

function getTodayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Extract time (HH:MM) from delivery time field or sent_at.
 *  If already delivered (sent_at contains "配信済み"), prefer actual time from Lステップ. */
function getDeliveryTime(item: DeliveryWithMetrics): string | null {
  // 1. If Lステップで配信済み → 実績時刻を優先
  if (item.latestMetric?.sent_at && item.latestMetric.sent_at.includes('配信済み')) {
    const m = item.latestMetric.sent_at.match(/(\d{1,2}):(\d{2})/);
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  }

  // 2. Fallback: ファネルビルダーの予定時刻
  if (item.time) return item.time;

  // 3. Fallback: sent_at from other statuses (予約済み etc.)
  if (item.latestMetric?.sent_at) {
    const m = item.latestMetric.sent_at.match(/(\d{1,2}):(\d{2})/);
    if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  }

  return null;
}

export function DeliveryTimeline({
  deliveries,
  segments,
  startDate,
  endDate,
  onDeliveryClick,
  onDeliveryDoubleClick,
  selectedDeliveryId,
  inlineExpandedIds,
}: DeliveryTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [zoom, setZoom] = useState(1);

  const totalDays = daysBetween(startDate, endDate);
  const today = getTodayStr();

  // Column width driven by global zoom
  const dayWidth = BASE_COL_WIDTH * zoom;

  // Track scroll state
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 2);
    setCanScrollLeft(scrollLeft > 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setContainerWidth(el.clientWidth);
      updateScrollState();
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);

    el.addEventListener('scroll', updateScrollState, { passive: true });
    updateScrollState();

    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', updateScrollState);
    };
  }, [updateScrollState]);

  // Global zoom via Ctrl+wheel / trackpad pinch
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.003;
        setZoom((prev) => {
          const next = Math.round((prev + delta) * 100) / 100;
          return Math.min(2.5, Math.max(0.3, next));
        });
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, []);

  // Sync chart strip scroll with main timeline scroll
  useEffect(() => {
    const main = scrollRef.current;
    const chart = chartScrollRef.current;
    if (!main || !chart) return;
    let syncing = false;
    const sync = (src: HTMLDivElement, dst: HTMLDivElement) => {
      if (syncing) return;
      syncing = true;
      dst.scrollLeft = src.scrollLeft;
      syncing = false;
    };
    const onMain = () => sync(main, chart);
    const onChart = () => sync(chart, main);
    main.addEventListener('scroll', onMain, { passive: true });
    chart.addEventListener('scroll', onChart, { passive: true });
    chart.scrollLeft = main.scrollLeft;
    return () => {
      main.removeEventListener('scroll', onMain);
      chart.removeEventListener('scroll', onChart);
    };
  }, [inlineExpandedIds]);

  // Group deliveries by date
  const byDate = useMemo(() => {
    const map = new Map<string, DeliveryWithMetrics[]>();
    for (const d of deliveries) {
      const existing = map.get(d.date) || [];
      existing.push(d);
      map.set(d.date, existing);
    }
    return map;
  }, [deliveries]);

  // Build date ticks
  const dateTicks = useMemo(() => {
    const allDates: string[] = [];
    const start = parseDate(startDate);
    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      allDates.push(`${y}-${m}-${day}`);
    }

    if (totalDays > 14) {
      const deliveryDates = new Set(deliveries.map(d => d.date));
      const visibleDates = new Set<string>();
      for (const date of deliveryDates) visibleDates.add(date);
      visibleDates.add(allDates[0]);
      visibleDates.add(allDates[allDates.length - 1]);
      if (allDates.includes(today)) visibleDates.add(today);
      return allDates.filter(d => visibleDates.has(d));
    }
    return allDates;
  }, [startDate, totalDays, deliveries, today]);

  // Segment color map
  const segmentMap = useMemo(() => {
    const m = new Map<string, Segment>();
    segments.forEach((s) => m.set(s.id, s));
    return m;
  }, [segments]);

  const timelineWidth = dayWidth * dateTicks.length;

  // Auto-scroll to today on mount
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || containerWidth === 0) return;
    const todayIdx = dateTicks.indexOf(today);
    if (todayIdx >= 0) {
      const targetScroll = Math.max(0, todayIdx * dayWidth - containerWidth / 3);
      el.scrollTo({ left: targetScroll, behavior: 'smooth' });
    }
  }, [containerWidth, dateTicks, today, dayWidth]);

  // Fit all columns to screen
  const handleFitScreen = useCallback(() => {
    if (dateTicks.length > 0 && scrollRef.current) {
      const w = scrollRef.current.clientWidth;
      const fitZoom = w / (dateTicks.length * BASE_COL_WIDTH);
      setZoom(Math.max(0.3, Math.min(2.5, Math.round(fitZoom * 100) / 100)));
    }
  }, [dateTicks.length]);

  // Preview scale: fit 280px into card inner width
  const cardInnerWidth = dayWidth - 14; // column padding (12) + card border (2)
  const previewZoom = cardInnerWidth / PREVIEW_NATIVE_WIDTH;

  if (deliveries.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-[color:var(--color-text-muted)]">
        配信データがありません
      </div>
    );
  }

  return (
    <div>
      {/* Zoom controls — top right, always visible */}
      <div className="mb-2 flex items-center justify-end">
        <div className="flex items-center gap-0.5 rounded-xl border border-[color:var(--color-border)] bg-white/90 px-1.5 py-1 shadow-sm backdrop-blur-sm">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.3, Math.round((z - 0.1) * 10) / 10))}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-sm font-medium text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-text-primary)]"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="flex h-6 min-w-[40px] items-center justify-center rounded-lg text-[11px] font-semibold tabular-nums text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-text-primary)]"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.1) * 10) / 10))}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-sm font-medium text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-text-primary)]"
          >
            +
          </button>
          <div className="mx-0.5 h-4 w-px bg-[color:var(--color-border)]" />
          <button
            type="button"
            onClick={handleFitScreen}
            className="flex h-6 items-center justify-center rounded-lg px-2 text-[10px] font-medium text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-text-primary)]"
          >
            Fit
          </button>
        </div>
      </div>

      {/* Scroll container */}
      <div className="relative">
        <div
          ref={scrollRef}
          className="overflow-x-auto overflow-y-auto scrollbar-hide"
          style={{ maxHeight: '60vh' }}
        >
          <div style={{ minWidth: timelineWidth, position: 'relative' }}>
            {/* Date axis */}
            <div
              className="flex border-b-2 border-[color:var(--color-border)]"
              style={{ position: 'sticky', top: 0, zIndex: 2 }}
            >
              {dateTicks.map((date) => {
                const hasDeliveries = byDate.has(date);
                const isToday = date === today;
                return (
                  <div
                    key={date}
                    className="shrink-0 border-r border-[color:var(--color-border)]/30 px-1 py-2 text-center"
                    style={{
                      width: dayWidth,
                      backgroundColor: isToday ? 'var(--color-accent-muted)' : 'var(--color-surface)',
                    }}
                  >
                    <div
                      className="text-[11px] font-medium"
                      style={{
                        fontWeight: hasDeliveries || isToday ? 600 : 400,
                        color: isToday
                          ? 'var(--color-accent)'
                          : hasDeliveries
                            ? 'var(--color-text-primary)'
                            : 'var(--color-text-muted)',
                      }}
                    >
                      {formatDate(date)}
                    </div>
                    <div
                      className="text-[9px]"
                      style={{
                        color: isToday ? 'var(--color-accent)' : 'var(--color-text-muted)',
                      }}
                    >
                      {isToday ? '今日' : formatWeekday(date)}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Delivery cards in columns */}
            <div className="flex" style={{ alignItems: 'flex-start' }}>
              {dateTicks.map((date) => {
                const items = byDate.get(date) || [];
                const isToday = date === today;

                if (items.length === 0) {
                  return (
                    <div
                      key={date}
                      className="shrink-0 border-r border-[color:var(--color-border)]/10"
                      style={{
                        width: dayWidth,
                        minHeight: 60,
                        backgroundColor: isToday ? 'rgba(10, 122, 255, 0.02)' : undefined,
                      }}
                    />
                  );
                }

                return (
                  <div
                    key={date}
                    className="flex shrink-0 flex-col gap-2 border-r border-[color:var(--color-border)]/10 p-1.5"
                    style={{
                      width: dayWidth,
                      backgroundColor: isToday ? 'rgba(10, 122, 255, 0.02)' : undefined,
                    }}
                  >
                    {items.map((item) => {
                      const openRate = item.latestMetric?.open_rate;
                      const rateColor = getOpenRateColor(openRate);
                      const isSelected = item.id === selectedDeliveryId;
                      const isExpanded = inlineExpandedIds?.has(item.id) ?? false;
                      const itemSegments = (item.segmentIds || [item.segmentId])
                        .map((sid) => segmentMap.get(sid))
                        .filter(Boolean) as Segment[];

                      const metric = item.latestMetric;
                      const clickRate =
                        item.clickCount !== undefined && metric && metric.delivery_count > 0
                          ? (item.clickCount / metric.delivery_count) * 100
                          : undefined;
                      const openToClickRate =
                        item.clickCount !== undefined && metric && metric.open_count > 0
                          ? (item.clickCount / metric.open_count) * 100
                          : undefined;

                      const deliveryTime = getDeliveryTime(item);

                      return (
                        <div
                          key={item.id}
                          className="overflow-hidden rounded-md border bg-[color:var(--color-surface)]"
                          style={{
                            borderColor: isExpanded || isSelected ? 'var(--color-accent)' : 'var(--color-border)',
                            boxShadow: isExpanded || isSelected ? '0 0 0 2px var(--color-accent-muted)' : undefined,
                          }}
                        >
                          {/* Header — clickable for selection */}
                          <button
                            type="button"
                            onClick={() => onDeliveryClick?.(item)}
                            onDoubleClick={() => onDeliveryDoubleClick?.(item)}
                            className="block w-full p-2 text-left transition-colors hover:bg-[color:var(--color-surface-muted)]"
                          >
                            {/* Time + segment badges */}
                            <div className="mb-1 flex items-center gap-1.5">
                              <span className="text-[13px] font-bold tabular-nums text-[color:var(--color-text-primary)]">
                                {deliveryTime || '--:--'}
                              </span>
                              {itemSegments.map((seg) => (
                                <span
                                  key={seg.id}
                                  className="inline-flex items-center rounded px-1 text-[8px] font-medium leading-3"
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

                            {/* KPI grid — 6 items: 3 cols × 2 rows */}
                            {metric && (
                              <div className="grid grid-cols-3 gap-1">
                                <MiniKpi label="配信数" value={metric.delivery_count.toLocaleString()} />
                                <MiniKpi label="開封数" value={metric.open_count.toLocaleString()} />
                                <MiniKpi label="開封率" value={`${metric.open_rate.toFixed(1)}%`} color={rateColor} />
                                {item.clickCount !== undefined ? (
                                  <>
                                    <MiniKpi label="クリック数" value={item.clickCount.toLocaleString()} color="#2563EB" />
                                    <MiniKpi label="クリック率" value={`${clickRate!.toFixed(1)}%`} color="#2563EB" />
                                    {openToClickRate !== undefined && (
                                      <MiniKpi label="開封→tap" value={`${openToClickRate.toFixed(1)}%`} color="#7C3AED" />
                                    )}
                                  </>
                                ) : (
                                  <MiniKpi label="クリック" value="—" />
                                )}
                              </div>
                            )}
                            {!metric && (
                              <div className="text-[9px] text-[color:var(--color-text-muted)]">
                                未計測
                              </div>
                            )}
                          </button>

                          {/* LINE preview — always shown, scaled to fit column */}
                          {item.messages && item.messages.length > 0 && (
                            <div className="border-t border-[color:var(--color-border)]/30">
                              <div style={{ zoom: previewZoom }}>
                                <LineMessagePreview
                                  messages={item.messages}
                                  notificationText={item.notificationText}
                                />
                              </div>
                            </div>
                          )}

                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

          </div>
        </div>

        {/* Scroll indicators */}
        {canScrollRight && (
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-12"
            style={{
              background: 'linear-gradient(to left, rgba(255,255,255,0.95), transparent)',
            }}
          />
        )}
        {canScrollLeft && (
          <div
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-12"
            style={{
              background: 'linear-gradient(to right, rgba(255,255,255,0.95), transparent)',
            }}
          />
        )}
      </div>

      {/* Chart comparison strip — separate scroll container synced with main */}
      {inlineExpandedIds && inlineExpandedIds.size > 0 && (
        <div
          ref={chartScrollRef}
          className="overflow-x-auto scrollbar-hide border-t-2 border-[color:var(--color-accent)]/20 rounded-b-lg"
          style={{ backgroundColor: 'rgba(10, 122, 255, 0.03)' }}
        >
          <div className="flex" style={{ minWidth: timelineWidth, alignItems: 'flex-start' }}>
            {dateTicks.map((date) => {
              const stripItems = byDate.get(date) || [];
              const expandedItems = stripItems.filter(i => inlineExpandedIds.has(i.id));

              if (expandedItems.length === 0) {
                return (
                  <div
                    key={`chart-${date}`}
                    className="shrink-0"
                    style={{ width: dayWidth }}
                  />
                );
              }

              return (
                <div
                  key={`chart-${date}`}
                  className="flex shrink-0 flex-col gap-1.5 p-1.5"
                  style={{ width: dayWidth }}
                >
                  {expandedItems.map((item) => {
                    const chartTime = getDeliveryTime(item);
                    return (
                      <div
                        key={`chart-${item.id}`}
                        className="overflow-hidden rounded-md border border-[color:var(--color-accent)]/30 bg-[color:var(--color-surface)]"
                      >
                        <div className="flex items-center justify-between border-b border-[color:var(--color-border)]/30 px-2 py-1">
                          <span className="truncate text-[9px] font-medium text-[color:var(--color-text-muted)]">
                            {chartTime || '--:--'} 開封率推移
                          </span>
                          <button
                            type="button"
                            onClick={() => onDeliveryClick?.(item)}
                            className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded text-[10px] text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-text-primary)]"
                          >
                            ×
                          </button>
                        </div>
                        {item.timeSeries && item.timeSeries.length > 1 ? (
                          <InlineMetricChart timeSeries={item.timeSeries} />
                        ) : (
                          <div className="px-2 py-3 text-center text-[9px] text-[color:var(--color-text-muted)]">
                            計測データなし
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniKpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded bg-[color:var(--color-surface-muted)] px-1.5 py-0.5">
      <div className="text-[7px] text-[color:var(--color-text-muted)]">{label}</div>
      <div className="text-[10px] font-bold" style={{ color: color || 'var(--color-text-primary)' }}>
        {value}
      </div>
    </div>
  );
}

function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

function InlineMetricChart({ timeSeries }: { timeSeries: BroadcastMetric[] }) {
  const data = useMemo(() => {
    const sorted = [...timeSeries].sort((a, b) => a.elapsed_minutes - b.elapsed_minutes);
    return sorted.map((m) => ({
      label: formatElapsed(m.elapsed_minutes),
      openRate: m.open_rate,
      openCount: m.open_count,
      deliveryCount: m.delivery_count,
    }));
  }, [timeSeries]);

  return (
    <div className="border-t border-[color:var(--color-border)]/30 px-1 py-2">
      <div className="mb-1 text-[8px] font-medium text-[color:var(--color-text-muted)]">開封率推移</div>
      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={data} margin={{ top: 2, right: 8, bottom: 0, left: -10 }}>
          <CartesianGrid strokeDasharray="2 2" stroke="var(--color-border)" opacity={0.3} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 8, fill: 'var(--color-text-muted)' }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 8, fill: 'var(--color-text-muted)' }}
            tickLine={false}
            axisLine={false}
            domain={[0, 'auto']}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              fontSize: 10,
              padding: '4px 8px',
            }}
            formatter={(value: number) => [`${value.toFixed(1)}%`, '開封率']}
          />
          <Line
            type="monotone"
            dataKey="openRate"
            stroke="#3B82F6"
            strokeWidth={1.5}
            dot={{ r: 2.5, fill: '#3B82F6' }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
