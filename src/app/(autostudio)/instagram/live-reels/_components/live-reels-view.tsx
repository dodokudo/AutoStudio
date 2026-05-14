'use client';

import { useMemo, useState } from 'react';
import type { BenchmarkRating, ReelMetricRow, ReelMetricsDashboardData, TranscriptSegment } from '@/lib/instagram/reelMetricsDashboard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function TranscriptTimeline({
  segments,
  avgWatchSeconds,
  durationSeconds,
}: {
  segments: TranscriptSegment[];
  avgWatchSeconds: number | null;
  durationSeconds: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const avgPct = avgWatchSeconds && durationSeconds > 0
    ? Math.min(100, Math.max(0, (avgWatchSeconds / durationSeconds) * 100))
    : null;

  const dropoffIdx = useMemo(() => {
    if (!avgWatchSeconds) return -1;
    let lastIdx = -1;
    for (let i = 0; i < segments.length; i += 1) {
      if (segments[i].start <= avgWatchSeconds) lastIdx = i;
    }
    return lastIdx;
  }, [segments, avgWatchSeconds]);

  return (
    <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-[color:var(--color-text-primary)]">
          台本タイムライン
          {avgWatchSeconds !== null && (
            <span className="ml-2 text-[color:var(--color-text-muted)]">
              平均 {avgWatchSeconds.toFixed(1)}秒 / 動画長 {durationSeconds.toFixed(0)}秒（視聴維持率 {avgPct !== null ? avgPct.toFixed(1) : '--'}%）
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="text-xs font-medium text-[color:var(--color-accent)] hover:underline"
        >
          {expanded ? '閉じる' : '全文表示'}
        </button>
      </div>

      {/* タイムラインバー */}
      <div className="relative mt-3 h-6 w-full rounded bg-white border border-[color:var(--color-border)]">
        {segments.map((seg, idx) => {
          const left = Math.max(0, (seg.start / durationSeconds) * 100);
          const width = Math.max(0.5, ((seg.end - seg.start) / durationSeconds) * 100);
          const isBeforeDropoff = avgWatchSeconds !== null && seg.start <= avgWatchSeconds;
          return (
            <button
              type="button"
              key={idx}
              onClick={() => setActiveIdx(activeIdx === idx ? null : idx)}
              onMouseEnter={() => setActiveIdx(idx)}
              className={`absolute top-0 h-full border-r border-white/60 transition-opacity ${
                idx === dropoffIdx
                  ? 'bg-[color:var(--color-error)]'
                  : isBeforeDropoff
                    ? 'bg-[color:var(--color-success)] opacity-70'
                    : 'bg-slate-300 opacity-50'
              } hover:opacity-100`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`[${seg.start.toFixed(1)}s〜${seg.end.toFixed(1)}s] ${seg.text}`}
            />
          );
        })}
        {avgPct !== null && (
          <div
            className="pointer-events-none absolute top-[-4px] bottom-[-4px] w-[2px] bg-[color:var(--color-error)]"
            style={{ left: `${avgPct}%` }}
          />
        )}
      </div>

      {/* 時間目盛り */}
      <div className="mt-1 flex justify-between text-[10px] text-[color:var(--color-text-muted)]">
        <span>0s</span>
        {avgWatchSeconds !== null && (
          <span style={{ marginLeft: `calc(${avgPct ?? 0}% - 2em)` }}>
            ← {avgWatchSeconds.toFixed(1)}s 離脱
          </span>
        )}
        <span>{durationSeconds.toFixed(0)}s</span>
      </div>

      {/* 選択されたセグメント詳細 */}
      {activeIdx !== null && segments[activeIdx] && (
        <div className="mt-2 rounded border border-[color:var(--color-border)] bg-white p-2">
          <div className="text-[10px] text-[color:var(--color-text-muted)]">
            {segments[activeIdx].start.toFixed(1)}s 〜 {segments[activeIdx].end.toFixed(1)}s
            {activeIdx === dropoffIdx && <span className="ml-2 text-[color:var(--color-error)] font-semibold">離脱位置</span>}
          </div>
          <div className="mt-1 text-sm text-[color:var(--color-text-primary)]">
            「{segments[activeIdx].text}」
          </div>
        </div>
      )}

      {/* 全文展開 */}
      {expanded && (
        <div className="mt-3 space-y-1 max-h-64 overflow-y-auto rounded border border-[color:var(--color-border)] bg-white p-2 text-xs">
          {segments.map((seg, idx) => (
            <div
              key={idx}
              className={`flex gap-2 py-0.5 ${idx === dropoffIdx ? 'rounded bg-[rgba(255,77,79,0.08)] px-1' : ''}`}
            >
              <span className="shrink-0 w-16 text-[color:var(--color-text-muted)] tabular-nums">
                {seg.start.toFixed(1)}s
              </span>
              <span className="text-[color:var(--color-text-primary)]">{seg.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  data: ReelMetricsDashboardData;
  rangeStartKey?: string | null;
  rangeEndKey?: string | null;
  useAllRange?: boolean;
}

type SortBy =
  | 'published'
  | 'views'
  | 'reach'
  | 'completion'
  | 'skip'
  | 'avg_watch'
  | 'likes'
  | 'saves';

type SortOrder = 'asc' | 'desc';

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'published', label: '投稿日' },
  { value: 'views', label: '再生数' },
  { value: 'reach', label: 'リーチ' },
  { value: 'completion', label: '視聴維持率' },
  { value: 'skip', label: 'スキップ率' },
  { value: 'avg_watch', label: '平均視聴' },
  { value: 'likes', label: 'いいね' },
  { value: 'saves', label: '保存' },
];

const numberFormatter = new Intl.NumberFormat('ja-JP');

function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return numberFormatter.format(Math.round(value));
}

function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  return `${value.toFixed(digits)}%`;
}

function formatSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--';
  if (value < 60) return `${value.toFixed(1)}秒`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value - minutes * 60);
  return `${minutes}分${seconds}秒`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatDateKeyFromIso(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function levelBadge(rating: BenchmarkRating): { label: string; className: string } {
  switch (rating.level) {
    case 'high':
      return { label: '高', className: 'bg-[rgba(25,195,125,0.12)] text-[color:var(--color-success)]' };
    case 'low':
      return { label: '低', className: 'bg-[rgba(255,77,79,0.12)] text-[color:var(--color-error)]' };
    case 'mid':
      return { label: '同水準', className: 'bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-secondary)]' };
    default:
      return { label: '—', className: 'bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-muted)]' };
  }
}

function MetricCell({ label, value, rating, formatter }: {
  label: string;
  value: number | null;
  rating: BenchmarkRating;
  formatter: (v: number | null) => string;
}) {
  const badge = levelBadge(rating);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-[color:var(--color-text-muted)]">{label}</span>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-[color:var(--color-text-primary)]">{formatter(value)}</span>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}>{badge.label}</span>
      </div>
      {rating.rank !== null && rating.total > 0 && (
        <span className="text-[10px] text-[color:var(--color-text-muted)]">最新{rating.total}件中 {rating.rank}位</span>
      )}
    </div>
  );
}

function ReelCard({ row }: { row: ReelMetricRow }) {
  const { snapshot, ratings } = row;

  return (
    <div className="flex items-start gap-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-3">
      {snapshot.thumbnailUrl && (
        <a href={snapshot.permalink ?? '#'} target="_blank" rel="noopener noreferrer" className="shrink-0">
          <img
            src={snapshot.thumbnailUrl}
            alt=""
            className="aspect-[9/16] w-24 rounded-md object-cover"
            loading="lazy"
          />
        </a>
      )}
      <div className="flex-1 min-w-0 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-xs text-[color:var(--color-text-muted)]">
          <div className="flex items-center gap-2">
            <span>{formatDate(snapshot.publishedAt)}</span>
            {snapshot.durationSeconds && (
              <>
                <span>•</span>
                <span>動画 {snapshot.durationSeconds.toFixed(0)}秒</span>
              </>
            )}
          </div>
          {snapshot.permalink && (
            <a
              href={snapshot.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[color:var(--color-accent)] hover:text-[color:var(--color-accent-hover)]"
            >
              Instagramで開く
            </a>
          )}
        </div>

        <div className="grid grid-cols-3 gap-4 md:grid-cols-7">
          <MetricCell label="再生数" value={snapshot.views} rating={ratings.views} formatter={formatNumber} />
          <MetricCell label="リーチ" value={snapshot.reach} rating={ratings.reach} formatter={formatNumber} />
          <MetricCell label="平均視聴" value={snapshot.avgWatchTimeSeconds} rating={ratings.avgWatchTime} formatter={formatSeconds} />
          <MetricCell
            label="視聴維持率"
            value={snapshot.completionRate !== null ? snapshot.completionRate * 100 : null}
            rating={ratings.completionRate}
            formatter={(v) => formatPercent(v, 1)}
          />
          <MetricCell label="スキップ率" value={snapshot.skipRate} rating={ratings.skipRate} formatter={(v) => formatPercent(v)} />
          <MetricCell label="いいね率" value={ratings.likeRate.value} rating={ratings.likeRate} formatter={(v) => formatPercent(v, 2)} />
          <MetricCell label="保存率" value={ratings.saveRate.value} rating={ratings.saveRate} formatter={(v) => formatPercent(v, 2)} />
        </div>

        {snapshot.transcriptSegments.length > 0 && snapshot.durationSeconds && (
          <TranscriptTimeline
            segments={snapshot.transcriptSegments}
            avgWatchSeconds={snapshot.avgWatchTimeSeconds}
            durationSeconds={snapshot.durationSeconds}
          />
        )}

        <div className="grid grid-cols-3 gap-3 border-t border-[color:var(--color-border)] pt-3 text-xs md:grid-cols-6">
          <div>
            <span className="text-[color:var(--color-text-muted)]">いいね</span>
            <div className="font-semibold text-[color:var(--color-text-primary)]">{formatNumber(snapshot.likes)}</div>
          </div>
          <div>
            <span className="text-[color:var(--color-text-muted)]">コメント</span>
            <div className="font-semibold text-[color:var(--color-text-primary)]">{formatNumber(snapshot.comments)}</div>
          </div>
          <div>
            <span className="text-[color:var(--color-text-muted)]">保存</span>
            <div className="font-semibold text-[color:var(--color-text-primary)]">{formatNumber(snapshot.saved)}</div>
          </div>
          <div>
            <span className="text-[color:var(--color-text-muted)]">シェア</span>
            <div className="font-semibold text-[color:var(--color-text-primary)]">{formatNumber(snapshot.shares)}</div>
          </div>
          <div>
            <span className="text-[color:var(--color-text-muted)]">再投稿</span>
            <div className="font-semibold text-[color:var(--color-text-primary)]">{formatNumber(snapshot.reposts)}</div>
          </div>
          <div>
            <span className="text-[color:var(--color-text-muted)]">FB再生</span>
            <div className="font-semibold text-[color:var(--color-text-primary)]">{formatNumber(snapshot.facebookViews)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function sortRows(rows: ReelMetricRow[], sortBy: SortBy, order: SortOrder): ReelMetricRow[] {
  const cloned = [...rows];
  const factor = order === 'desc' ? 1 : -1;
  const get = (row: ReelMetricRow): number => {
    const s = row.snapshot;
    const r = row.ratings;
    switch (sortBy) {
      case 'published':
        return s.publishedAt ? new Date(s.publishedAt).getTime() : 0;
      case 'views':
        return s.views ?? -Infinity;
      case 'reach':
        return s.reach ?? -Infinity;
      case 'completion':
        return s.completionRate ?? -Infinity;
      case 'skip':
        return s.skipRate ?? -Infinity;
      case 'avg_watch':
        return s.avgWatchTimeSeconds ?? -Infinity;
      case 'likes':
        return r.likeRate.value ?? -Infinity;
      case 'saves':
        return r.saveRate.value ?? -Infinity;
      default:
        return 0;
    }
  };
  return cloned.sort((a, b) => (get(b) - get(a)) * factor);
}

function filterByRange(rows: ReelMetricRow[], startKey: string | null | undefined, endKey: string | null | undefined, useAllRange: boolean): ReelMetricRow[] {
  if (useAllRange || !startKey || !endKey) return rows;
  return rows.filter((row) => {
    const key = formatDateKeyFromIso(row.snapshot.publishedAt);
    if (!key) return false;
    return key >= startKey && key <= endKey;
  });
}

export function LiveReelsView({ data, rangeStartKey, rangeEndKey, useAllRange }: Props) {
  const [sortBy, setSortBy] = useState<SortBy>('published');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const filteredRows = useMemo(
    () => filterByRange(data.rows, rangeStartKey, rangeEndKey, useAllRange ?? false),
    [data.rows, rangeStartKey, rangeEndKey, useAllRange],
  );
  const sortedRows = useMemo(() => sortRows(filteredRows, sortBy, sortOrder), [filteredRows, sortBy, sortOrder]);

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">リール一覧</h2>
          <p className="text-xs text-[color:var(--color-text-muted)]">表示件数 {sortedRows.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as SortBy)}
            className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <Button
            variant="secondary"
            className="h-9 px-3 text-sm"
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
          >
            {sortOrder === 'desc' ? '降順' : '昇順'}
          </Button>
        </div>
      </div>

      {sortedRows.length === 0 ? (
        <div className="mt-6 rounded-[var(--radius-sm)] border border-dashed border-[color:var(--color-border)] p-6 text-center text-sm text-[color:var(--color-text-muted)]">
          表示できるリールがありません。期間を変更するか、<code className="rounded bg-[color:var(--color-surface-muted)] px-2 py-0.5">npm run ig:metrics</code> を実行してください。
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {sortedRows.map((row) => (
            <ReelCard key={row.snapshot.instagramId} row={row} />
          ))}
        </div>
      )}
    </Card>
  );
}
