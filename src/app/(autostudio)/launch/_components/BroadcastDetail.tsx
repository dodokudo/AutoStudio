'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from 'recharts';
import type { DeliveryWithMetrics, BroadcastMetric } from '@/types/launch';
import { LineMessagePreview } from './LineMessagePreview';

const numberFormatter = new Intl.NumberFormat('ja-JP');

function formatElapsedLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

// Standardized time points for x-axis
const STANDARD_POINTS = [30, 60, 720, 1440, 2880, 4320, 5760, 7200]; // 30m, 1h, 12h, 24h, 2d, 3d, 4d, 5d
const STANDARD_LABELS = ['30m', '1h', '12h', '24h', '2d', '3d', '4d', '5d'];

interface BroadcastDetailProps {
  delivery: DeliveryWithMetrics;
  allDeliveries?: DeliveryWithMetrics[];
}

export function BroadcastDetail({ delivery, allDeliveries }: BroadcastDetailProps) {
  const { latestMetric, timeSeries, messages, notificationText } = delivery;

  // Prepare chart data from time series
  const chartData = useMemo(() => {
    if (!timeSeries || timeSeries.length === 0) return [];

    // Try standard point matching first
    const standardMatched = STANDARD_POINTS.map((targetMin, idx) => {
      let closest: BroadcastMetric | null = null;
      let minDist = Infinity;
      for (const point of timeSeries) {
        const dist = Math.abs(point.elapsed_minutes - targetMin);
        if (dist < minDist) {
          minDist = dist;
          closest = point;
        }
      }
      const threshold = targetMin * 0.5;
      if (closest && minDist <= threshold) {
        return {
          label: STANDARD_LABELS[idx],
          elapsed_minutes: targetMin,
          open_rate: closest.open_rate,
          open_count: closest.open_count,
          delivery_count: closest.delivery_count,
        };
      }
      return null;
    }).filter(Boolean) as { label: string; elapsed_minutes: number; open_rate: number; open_count: number; delivery_count: number }[];

    if (standardMatched.length >= 2) return standardMatched;

    // Fallback: raw data points
    const sorted = [...timeSeries].sort((a, b) => a.elapsed_minutes - b.elapsed_minutes);
    const seen = new Map<number, BroadcastMetric>();
    for (const p of sorted) {
      const bucket = Math.round(p.elapsed_minutes / 15) * 15;
      seen.set(bucket, p);
    }
    return Array.from(seen.values())
      .sort((a, b) => a.elapsed_minutes - b.elapsed_minutes)
      .map((p) => ({
        label: formatElapsedLabel(p.elapsed_minutes),
        elapsed_minutes: p.elapsed_minutes,
        open_rate: p.open_rate,
        open_count: p.open_count,
        delivery_count: p.delivery_count,
      }));
  }, [timeSeries]);

  // Check if time series spans a meaningful range (> 2h gap between first and last)
  const hasGoodTimeSeries = useMemo(() => {
    if (chartData.length < 2) return false;
    const range = chartData[chartData.length - 1].elapsed_minutes - chartData[0].elapsed_minutes;
    return range > 120; // more than 2 hours span
  }, [chartData]);

  const hasChart = chartData.length >= 2;
  const hasMessages = messages && messages.length > 0;

  // Comparison data: all deliveries with metrics, sorted by open rate
  const comparisonData = useMemo(() => {
    if (!allDeliveries) return [];
    return allDeliveries
      .filter((d) => d.latestMetric)
      .map((d) => ({
        id: d.id,
        name: formatDateLabel(d.date),
        fullName: d.title,
        open_rate: d.latestMetric!.open_rate,
        click_rate:
          d.clickCount !== undefined && d.latestMetric!.delivery_count > 0
            ? (d.clickCount / d.latestMetric!.delivery_count) * 100
            : null,
        isCurrent: d.id === delivery.id,
      }))
      .sort((a, b) => b.open_rate - a.open_rate);
  }, [allDeliveries, delivery.id]);

  const avgOpenRate = useMemo(() => {
    if (comparisonData.length === 0) return 0;
    return comparisonData.reduce((sum, d) => sum + d.open_rate, 0) / comparisonData.length;
  }, [comparisonData]);

  return (
    <div className="flex flex-col gap-4">
      {/* Stats cards — always at top for quick scan */}
      {latestMetric && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
            gap: 10,
          }}
        >
          <StatCard
            label="配信数"
            value={numberFormatter.format(latestMetric.delivery_count)}
            sub={`${latestMetric.broadcast_name}`}
          />
          <StatCard
            label="開封数"
            value={numberFormatter.format(latestMetric.open_count)}
            sub={`配信数の ${latestMetric.open_rate.toFixed(1)}%`}
          />
          <StatCard
            label="開封率"
            value={`${latestMetric.open_rate.toFixed(1)}%`}
            sub={getOpenRateLabel(latestMetric.open_rate)}
            valueColor={getOpenRateColor(latestMetric.open_rate)}
          />
          {delivery.clickCount !== undefined && (
            <>
              <StatCard
                label="クリック数"
                value={numberFormatter.format(delivery.clickCount)}
                sub={`タグ: ${delivery.clickTag}`}
                valueColor="#2563EB"
              />
              <StatCard
                label="クリック率"
                value={`${((delivery.clickCount / latestMetric.delivery_count) * 100).toFixed(1)}%`}
                sub="配信数ベース"
                valueColor="#2563EB"
              />
              {latestMetric.open_count > 0 && (
                <StatCard
                  label="開封→クリック"
                  value={`${((delivery.clickCount / latestMetric.open_count) * 100).toFixed(1)}%`}
                  sub={`${delivery.clickCount}/${latestMetric.open_count}`}
                  valueColor="#7C3AED"
                />
              )}
            </>
          )}
          <StatCard
            label="最終計測"
            value={formatMeasuredAt(latestMetric.measured_at)}
            sub={`経過 ${formatElapsedLabel(latestMetric.elapsed_minutes)}`}
          />
        </div>
      )}

      {/* Main content: LEFT=messages, RIGHT=charts */}
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-5">
        {/* LEFT: LINE message preview */}
        {hasMessages && (
          <div className="flex-shrink-0">
            <SectionLabel>メッセージ プレビュー</SectionLabel>
            <LineMessagePreview
              messages={messages!}
              notificationText={notificationText}
            />
          </div>
        )}

        {/* RIGHT: Charts stacked vertically */}
        <div className="flex flex-1 min-w-0 flex-col gap-4">
          {/* Time series chart — only if good data */}
          {hasChart && hasGoodTimeSeries && (
            <div>
              <SectionLabel>開封率 推移</SectionLabel>
              <div style={{ width: '100%', height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: '#6B7280' }}
                      axisLine={{ stroke: '#E5E7EB' }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[0, 'auto']}
                      tick={{ fontSize: 11, fill: '#6B7280' }}
                      axisLine={{ stroke: '#E5E7EB' }}
                      tickLine={false}
                      tickFormatter={(v: number) => `${v}%`}
                      width={44}
                    />
                    <Tooltip
                      formatter={(value: number) => [`${value.toFixed(1)}%`, '開封率']}
                      contentStyle={{
                        fontSize: 12,
                        borderRadius: 6,
                        border: '1px solid #E5E7EB',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="open_rate"
                      stroke="#3B82F6"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#3B82F6', stroke: 'white', strokeWidth: 2 }}
                      activeDot={{ r: 6, fill: '#2563EB' }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Comparison bar chart — all deliveries with metrics */}
          {comparisonData.length >= 1 && (
            <div>
              <SectionLabel>
                全配信 開封率比較
                {comparisonData.length > 1 && (
                  <span style={{ fontWeight: 400, color: '#9CA3AF', marginLeft: 8 }}>
                    平均 {avgOpenRate.toFixed(1)}%
                  </span>
                )}
              </SectionLabel>
              <div style={{ width: '100%', height: Math.max(160, comparisonData.length * 28 + 40) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={comparisonData}
                    layout="vertical"
                    margin={{ top: 4, right: 40, left: 4, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, (max: number) => Math.ceil(Math.max(max, 50) / 10) * 10]}
                      tick={{ fontSize: 10, fill: '#9CA3AF' }}
                      axisLine={{ stroke: '#E5E7EB' }}
                      tickLine={false}
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={140}
                      tick={({ x, y, payload }) => {
                        const item = comparisonData.find((d) => d.name === payload.value);
                        const isCurrent = item?.isCurrent;
                        return (
                          <text
                            x={x}
                            y={y}
                            dy={4}
                            textAnchor="end"
                            fontSize={11}
                            fontWeight={isCurrent ? 700 : 400}
                            fill={isCurrent ? '#111' : '#6B7280'}
                          >
                            {payload.value}
                          </text>
                        );
                      }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                      content={({ active, payload: tooltipPayload }) => {
                        if (!active || !tooltipPayload?.length) return null;
                        const d = tooltipPayload[0].payload;
                        return (
                          <div
                            style={{
                              background: 'white',
                              border: '1px solid #E5E7EB',
                              borderRadius: 6,
                              padding: '8px 12px',
                              fontSize: 12,
                              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                            }}
                          >
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.fullName}</div>
                            <div>開封率: <strong>{d.open_rate.toFixed(1)}%</strong></div>
                            {d.click_rate !== null && (
                              <div style={{ color: '#2563EB' }}>
                                クリック率: <strong>{d.click_rate.toFixed(1)}%</strong>
                              </div>
                            )}
                          </div>
                        );
                      }}
                    />
                    {comparisonData.length > 1 && (
                      <ReferenceLine
                        x={avgOpenRate}
                        stroke="#9CA3AF"
                        strokeDasharray="4 4"
                        strokeWidth={1}
                      />
                    )}
                    <Bar dataKey="open_rate" radius={[0, 4, 4, 0]} barSize={16}>
                      {comparisonData.map((entry) => (
                        <Cell
                          key={entry.id}
                          fill={entry.isCurrent ? '#3B82F6' : '#E5E7EB'}
                          stroke={entry.isCurrent ? '#2563EB' : 'none'}
                          strokeWidth={entry.isCurrent ? 1 : 0}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Fallback: no time series AND no comparison data */}
          {!hasChart && comparisonData.length === 0 && !latestMetric && (
            <div
              className="flex items-center justify-center rounded-lg border border-dashed border-[color:var(--color-border)]"
              style={{ height: 120 }}
            >
              <span className="text-sm text-[color:var(--color-text-muted)]">
                メトリクスデータはまだ取得されていません
              </span>
            </div>
          )}

          {/* Time series note when data exists but isn't great */}
          {hasChart && !hasGoodTimeSeries && latestMetric && (
            <div
              className="rounded-md px-3 py-2 text-xs text-[color:var(--color-text-muted)]"
              style={{ backgroundColor: '#F9FAFB', border: '1px solid #F3F4F6' }}
            >
              計測開始から時間が経過すると、30m→1h→12h→24h→2d〜5dの推移チャートが表示されます
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ------- Sub components -------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: '#6B7280',
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {children}
    </p>
  );
}

// ------- Helpers -------

function getOpenRateColor(rate: number): string {
  if (rate >= 40) return '#16A34A';
  if (rate >= 20) return '#CA8A04';
  return '#DC2626';
}

function getOpenRateLabel(rate: number): string {
  if (rate >= 40) return '高い';
  if (rate >= 20) return '標準';
  return '要改善';
}

function formatDateLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return dateStr;
  }
}

function formatMeasuredAt(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return iso;
  }
}

function StatCard({
  label,
  value,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        padding: '8px 12px',
        borderRadius: 8,
        border: '1px solid #E5E7EB',
        backgroundColor: '#FAFAFA',
      }}
    >
      <p style={{ fontSize: 10, color: '#6B7280', fontWeight: 500, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </p>
      <p
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: valueColor || '#111',
          margin: '3px 0 0',
          lineHeight: 1.2,
        }}
      >
        {value}
      </p>
      {sub && (
        <p style={{ fontSize: 10, color: '#9CA3AF', margin: '2px 0 0' }}>{sub}</p>
      )}
    </div>
  );
}
