'use client';

import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import type { DeliveryWithMetrics, Segment } from '@/types/launch';

// Open rate color thresholds
function getOpenRateColor(rate: number | undefined): string {
  if (rate === undefined) return 'var(--color-text-muted)';
  if (rate >= 40) return '#16A34A';
  if (rate >= 20) return '#CA8A04';
  return '#DC2626';
}

function getOpenRateBgColor(rate: number | undefined): string {
  if (rate === undefined) return 'var(--color-surface-muted)';
  if (rate >= 40) return '#DCFCE7';
  if (rate >= 20) return '#FEF9C3';
  return '#FEE2E2';
}

interface DeliveryTimelineProps {
  deliveries: DeliveryWithMetrics[];
  segments: Segment[];
  startDate: string;
  endDate: string;
  onDeliveryClick?: (delivery: DeliveryWithMetrics) => void;
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

export function DeliveryTimeline({
  deliveries,
  segments,
  startDate,
  endDate,
  onDeliveryClick,
}: DeliveryTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);

  const totalDays = daysBetween(startDate, endDate);
  const today = getTodayStr();

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

  // Build date ticks - only show dates with deliveries (compact view)
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

    // Only show dates that have deliveries for cleaner view
    if (totalDays > 14) {
      const deliveryDates = new Set(deliveries.map(d => d.date));
      const visibleDates = new Set<string>();
      for (const date of deliveryDates) {
        visibleDates.add(date);
      }
      // Always include first and last day
      visibleDates.add(allDates[0]);
      visibleDates.add(allDates[allDates.length - 1]);
      // Include today if in range
      if (allDates.includes(today)) {
        visibleDates.add(today);
      }
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

  // Column width: wider for readability (140px min)
  const dayWidth = containerWidth > 0
    ? Math.max(140, containerWidth / dateTicks.length)
    : 140;
  const timelineWidth = Math.max(dayWidth * dateTicks.length, dateTicks.length * 140);

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

  if (deliveries.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-[color:var(--color-text-muted)]">
        配信データがありません
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Scroll container */}
      <div
        ref={scrollRef}
        className="overflow-x-auto scrollbar-hide"
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
          <div className="flex">
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
                  className="flex shrink-0 flex-col gap-1.5 border-r border-[color:var(--color-border)]/10 p-1.5"
                  style={{
                    width: dayWidth,
                    backgroundColor: isToday ? 'rgba(10, 122, 255, 0.02)' : undefined,
                  }}
                >
                  {items.map((item) => {
                    const openRate = item.latestMetric?.open_rate;
                    const rateColor = getOpenRateColor(openRate);
                    const rateBgColor = getOpenRateBgColor(openRate);
                    const itemSegments = (item.segmentIds || [item.segmentId])
                      .map((sid) => segmentMap.get(sid))
                      .filter(Boolean) as Segment[];

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onDeliveryClick?.(item)}
                        className="block w-full rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-2 text-left transition-shadow hover:shadow-md"
                      >
                        {/* Title - 2 lines */}
                        <div
                          className="mb-1 text-[11px] font-semibold leading-tight text-[color:var(--color-text-primary)]"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {item.title}
                        </div>

                        {/* Segment badges */}
                        {itemSegments.length > 0 && (
                          <div className="mb-1 flex flex-wrap gap-0.5">
                            {itemSegments.map((seg) => (
                              <span
                                key={seg.id}
                                className="inline-flex items-center rounded px-1 text-[9px] font-medium leading-3.5"
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
                        )}

                        {/* Open rate badge */}
                        {openRate !== undefined ? (
                          <div
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ color: rateColor, backgroundColor: rateBgColor }}
                          >
                            {openRate.toFixed(1)}%
                          </div>
                        ) : (
                          <div className="text-[9px] text-[color:var(--color-text-muted)]">
                            未計測
                          </div>
                        )}

                        {/* Click rate badge (only for deliveries with clickTag) */}
                        {item.clickCount !== undefined && item.latestMetric && item.latestMetric.delivery_count > 0 && (
                          <div
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                            style={{ color: '#2563EB', backgroundColor: '#DBEAFE' }}
                          >
                            {((item.clickCount / item.latestMetric.delivery_count) * 100).toFixed(1)}% tap
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right scroll indicator */}
      {canScrollRight && (
        <div
          className="pointer-events-none absolute right-0 top-0 bottom-0 w-12"
          style={{
            background: 'linear-gradient(to left, rgba(255,255,255,0.95), transparent)',
          }}
        />
      )}
      {/* Left scroll indicator */}
      {canScrollLeft && (
        <div
          className="pointer-events-none absolute left-0 top-0 bottom-0 w-12"
          style={{
            background: 'linear-gradient(to right, rgba(255,255,255,0.95), transparent)',
          }}
        />
      )}
    </div>
  );
}
