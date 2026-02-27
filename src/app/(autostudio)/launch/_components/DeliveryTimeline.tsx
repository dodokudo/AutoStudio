'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import type { DeliveryWithMetrics, Segment } from '@/types/launch';

// Type icons
const TYPE_ICONS: Record<string, string> = {
  message: '\u2709\uFE0F',  // envelope
  video: '\uD83C\uDFA5',    // movie camera
  sale: '\uD83D\uDCB0',     // money bag
  reminder: '\u23F0',       // alarm clock
  branch: '\uD83D\uDD00',   // shuffle
};

// Open rate color thresholds
function getOpenRateColor(rate: number | undefined): string {
  if (rate === undefined) return '#9CA3AF'; // gray
  if (rate >= 40) return '#16A34A'; // green
  if (rate >= 20) return '#CA8A04'; // yellow
  return '#DC2626'; // red
}

function getOpenRateBgColor(rate: number | undefined): string {
  if (rate === undefined) return '#F3F4F6';
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

function daysBetween(a: string, b: string): number {
  const da = parseDate(a);
  const db = parseDate(b);
  return Math.round((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setContainerWidth(el.clientWidth);
    });
    observer.observe(el);
    setContainerWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const totalDays = daysBetween(startDate, endDate);

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

  // Build date ticks (with thinning for long periods)
  const dateTicks = useMemo(() => {
    const allTicks: string[] = [];
    const start = parseDate(startDate);
    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      allTicks.push(`${y}-${m}-${day}`);
    }

    // For long periods (>30 days), only show days with deliveries + adjacent days
    if (totalDays > 30) {
      const deliveryDates = new Set(deliveries.map(d => d.date));
      const visibleDates = new Set<string>();
      for (const date of deliveryDates) {
        const idx = allTicks.indexOf(date);
        if (idx >= 0) {
          if (idx > 0) visibleDates.add(allTicks[idx - 1]);
          visibleDates.add(allTicks[idx]);
          if (idx < allTicks.length - 1) visibleDates.add(allTicks[idx + 1]);
        }
      }
      // Always include first and last day
      visibleDates.add(allTicks[0]);
      visibleDates.add(allTicks[allTicks.length - 1]);
      return allTicks.filter(d => visibleDates.has(d));
    }

    return allTicks;
  }, [startDate, totalDays, deliveries]);

  // Segment color map
  const segmentMap = useMemo(() => {
    const m = new Map<string, Segment>();
    segments.forEach((s) => m.set(s.id, s));
    return m;
  }, [segments]);

  const dayWidth = containerWidth > 0
    ? Math.max(80, containerWidth / dateTicks.length)
    : 120;
  const timelineWidth = Math.max(dayWidth * dateTicks.length, dateTicks.length * 80);

  if (deliveries.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-[color:var(--color-text-muted)]">
        配信データがありません
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className="overflow-x-auto"
      style={{ scrollbarWidth: 'thin' }}
    >
      <div style={{ minWidth: timelineWidth, position: 'relative' }}>
        {/* Date axis */}
        <div
          style={{
            display: 'flex',
            borderBottom: '2px solid #E5E7EB',
            position: 'sticky',
            top: 0,
            backgroundColor: 'white',
            zIndex: 2,
          }}
        >
          {dateTicks.map((date) => {
            const hasDeliveries = byDate.has(date);
            return (
              <div
                key={date}
                style={{
                  width: dayWidth,
                  flexShrink: 0,
                  padding: '8px 4px',
                  textAlign: 'center',
                  fontSize: 11,
                  fontWeight: hasDeliveries ? 600 : 400,
                  color: hasDeliveries ? '#111' : '#9CA3AF',
                  borderRight: '1px solid #F3F4F6',
                }}
              >
                {formatDate(date)}
              </div>
            );
          })}
        </div>

        {/* Delivery cards in columns */}
        <div style={{ display: 'flex', minHeight: 200 }}>
          {dateTicks.map((date) => {
            const items = byDate.get(date) || [];

            // Empty day: render lightweight empty column
            if (items.length === 0) {
              return (
                <div
                  key={date}
                  style={{
                    width: dayWidth,
                    flexShrink: 0,
                    borderRight: '1px solid #F9FAFB',
                    minHeight: 200,
                  }}
                />
              );
            }

            return (
              <div
                key={date}
                style={{
                  width: dayWidth,
                  flexShrink: 0,
                  padding: '6px 4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  borderRight: '1px solid #F9FAFB',
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
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '6px 8px',
                        borderRadius: 6,
                        border: '1px solid #E5E7EB',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        transition: 'box-shadow 0.15s',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.boxShadow =
                          '0 2px 8px rgba(0,0,0,0.1)';
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                      }}
                    >
                      {/* Title row */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          marginBottom: 3,
                        }}
                      >
                        <span style={{ fontSize: 12 }}>
                          {TYPE_ICONS[item.type] || '\u2709\uFE0F'}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#111',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                          }}
                        >
                          {item.title}
                        </span>
                      </div>

                      {/* Segment badges */}
                      {itemSegments.length > 0 && (
                        <div
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 2,
                            marginBottom: 3,
                          }}
                        >
                          {itemSegments.map((seg) => (
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
                      )}

                      {/* Open rate badge */}
                      {openRate !== undefined && (
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                            fontSize: 10,
                            fontWeight: 600,
                            color: rateColor,
                            backgroundColor: rateBgColor,
                            borderRadius: 4,
                            padding: '1px 5px',
                          }}
                        >
                          <span style={{ fontSize: 8 }}>{openRate >= 40 ? '\u25B2' : openRate >= 20 ? '\u25CF' : '\u25BC'}</span>
                          {openRate.toFixed(1)}%
                        </div>
                      )}
                      {openRate === undefined && (
                        <div
                          style={{
                            fontSize: 9,
                            color: '#9CA3AF',
                          }}
                        >
                          計測なし
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
  );
}
