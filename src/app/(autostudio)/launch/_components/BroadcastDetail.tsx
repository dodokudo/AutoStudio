'use client';

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
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
}

export function BroadcastDetail({ delivery }: BroadcastDetailProps) {
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

    // If standard matching yields 2+ points, use it
    if (standardMatched.length >= 2) return standardMatched;

    // Fallback: use raw data points sorted by elapsed_minutes
    const sorted = [...timeSeries].sort((a, b) => a.elapsed_minutes - b.elapsed_minutes);
    // Deduplicate by picking the latest measurement per unique elapsed_minutes bucket (round to 15min)
    const seen = new Map<number, BroadcastMetric>();
    for (const p of sorted) {
      const bucket = Math.round(p.elapsed_minutes / 15) * 15;
      seen.set(bucket, p); // later measurement overwrites earlier
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

  const hasChart = chartData.length >= 2;
  const hasMessages = messages && messages.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Main content: LEFT=messages, RIGHT=chart */}
      <div className="flex flex-col gap-5 lg:flex-row lg:gap-6">
        {/* LEFT: LINE message preview */}
        {hasMessages && (
          <div className="flex-shrink-0">
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: '#6B7280',
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              メッセージ プレビュー
            </p>
            <LineMessagePreview
              messages={messages!}
              notificationText={notificationText}
            />
          </div>
        )}

        {/* RIGHT: Time series chart */}
        <div className="flex-1 min-w-0">
          {hasChart ? (
            <>
              <p
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#6B7280',
                  marginBottom: 6,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                開封率 推移
              </p>
              <div style={{ width: '100%', height: 220 }}>
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
                      width={48}
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
            </>
          ) : (
            <div
              className="flex items-center justify-center rounded-lg border border-dashed border-[color:var(--color-border)]"
              style={{ height: 220 }}
            >
              <span className="text-sm text-[color:var(--color-text-muted)]">
                時系列データが不足しています
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Summary stats */}
      {latestMetric && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
            gap: 12,
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
            label="最終計測日時"
            value={formatMeasuredAt(latestMetric.measured_at)}
            sub={`経過 ${formatElapsedLabel(latestMetric.elapsed_minutes)}`}
          />
        </div>
      )}

      {!latestMetric && (
        <div
          className="rounded-lg border border-dashed border-[color:var(--color-border)] px-4 py-6 text-center text-sm text-[color:var(--color-text-muted)]"
        >
          この配信のメトリクスデータはまだ取得されていません
        </div>
      )}
    </div>
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
        padding: '10px 14px',
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
          fontSize: 20,
          fontWeight: 700,
          color: valueColor || '#111',
          margin: '4px 0 0',
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
