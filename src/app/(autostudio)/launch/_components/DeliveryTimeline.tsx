'use client';

import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import type { DeliveryWithMetrics, Segment } from '@/types/launch';
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
  selectedDeliveryId?: string | null;
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
  selectedDeliveryId,
}: DeliveryTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
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
                    const rateBgColor = getOpenRateBgColor(openRate);
                    const isSelected = item.id === selectedDeliveryId;
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

                    return (
                      <div
                        key={item.id}
                        className="overflow-hidden rounded-md border bg-[color:var(--color-surface)]"
                        style={{
                          borderColor: isSelected ? 'var(--color-accent)' : 'var(--color-border)',
                          boxShadow: isSelected ? '0 0 0 2px var(--color-accent-muted)' : undefined,
                        }}
                      >
                        {/* Header — clickable for selection */}
                        <button
                          type="button"
                          onClick={() => onDeliveryClick?.(item)}
                          className="block w-full p-2 text-left transition-colors hover:bg-[color:var(--color-surface-muted)]"
                        >
                          {/* Title */}
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

                          {/* Rate badges */}
                          <div className="flex flex-wrap items-center gap-1">
                            {openRate !== undefined ? (
                              <div
                                className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                style={{ color: rateColor, backgroundColor: rateBgColor }}
                              >
                                {openRate.toFixed(1)}%
                              </div>
                            ) : (
                              <div className="text-[9px] text-[color:var(--color-text-muted)]">
                                未計測
                              </div>
                            )}
                            {clickRate !== undefined && (
                              <div
                                className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                style={{ color: '#2563EB', backgroundColor: '#DBEAFE' }}
                              >
                                {clickRate.toFixed(1)}% tap
                              </div>
                            )}
                          </div>

                          {/* KPI grid — 6 items: 2 cols × 3 rows */}
                          {metric && (
                            <div className="mt-2 grid grid-cols-2 gap-1">
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

      {/* Zoom controls — bottom right */}
      <div
        className="absolute bottom-3 right-3 flex items-center gap-0.5 rounded-xl border border-[color:var(--color-border)] bg-white/90 px-1.5 py-1 shadow-lg backdrop-blur-sm"
        style={{ zIndex: 10 }}
      >
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.3, Math.round((z - 0.1) * 10) / 10))}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-medium text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-text-primary)]"
        >
          −
        </button>
        <button
          type="button"
          onClick={() => setZoom(1)}
          className="flex h-7 min-w-[48px] items-center justify-center rounded-lg text-[11px] font-semibold tabular-nums text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-text-primary)]"
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2.5, Math.round((z + 0.1) * 10) / 10))}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-sm font-medium text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-text-primary)]"
        >
          +
        </button>
        <div className="mx-0.5 h-4 w-px bg-[color:var(--color-border)]" />
        <button
          type="button"
          onClick={handleFitScreen}
          className="flex h-7 items-center justify-center rounded-lg px-2 text-[10px] font-medium text-[color:var(--color-text-muted)] transition-colors hover:bg-[color:var(--color-surface-muted)] hover:text-[color:var(--color-text-primary)]"
        >
          Fit
        </button>
      </div>
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
