'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import type {
  CompetitorAccountSummary,
  CompetitorDashboardData,
  CompetitorFollowerPoint,
  CompetitorReel,
  CompetitorTranscriptSegment,
} from '@/lib/instagram/competitorDashboard';

interface Props {
  data: CompetitorDashboardData;
}

const COLORS = [
  '#0a7aff', '#ff4d4f', '#19c37d', '#ffb020', '#a855f7',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
  '#14b8a6', '#eab308',
];

function num(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('ja-JP');
}

function delta(value: number | null): { label: string; color: string } {
  if (value === null) return { label: '—', color: 'text-[color:var(--color-text-muted)]' };
  if (value > 0) return { label: `+${value.toLocaleString()}`, color: 'text-[color:var(--color-success)]' };
  if (value < 0) return { label: value.toLocaleString(), color: 'text-[color:var(--color-error)]' };
  return { label: '±0', color: 'text-[color:var(--color-text-muted)]' };
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function FollowerChart({ series }: { series: CompetitorFollowerPoint[] }) {
  const data = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string>>();
    const usernames = new Set<string>();
    for (const point of series) {
      usernames.add(point.username);
      const row = byDate.get(point.date) ?? { date: point.date };
      if (point.followersCount !== null) row[point.username] = point.followersCount;
      byDate.set(point.date, row);
    }
    return {
      rows: Array.from(byDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date))),
      usernames: Array.from(usernames),
    };
  }, [series]);

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.rows} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {data.usernames.map((u, i) => (
            <Line
              key={u}
              type="monotone"
              dataKey={u}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function AccountSummaryTable({ summaries }: { summaries: CompetitorAccountSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-[color:var(--color-border)] text-xs text-[color:var(--color-text-muted)]">
          <tr>
            <th className="px-3 py-2 text-left">アカウント</th>
            <th className="px-3 py-2 text-right">フォロワー</th>
            <th className="px-3 py-2 text-right">7日増減</th>
            <th className="px-3 py-2 text-right">30日増減</th>
            <th className="px-3 py-2 text-right">最高再生数</th>
          </tr>
        </thead>
        <tbody>
          {summaries.map((s) => {
            const d7 = delta(s.followerDelta7d);
            const d30 = delta(s.followerDelta30d);
            return (
              <tr key={s.username} className="border-b border-[color:var(--color-border)]">
                <td className="px-3 py-2">
                  <a
                    href={s.accountUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[color:var(--color-accent)] hover:underline"
                  >
                    @{s.username}
                  </a>
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{num(s.latestFollowers)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${d7.color}`}>{d7.label}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${d30.color}`}>{d30.label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{num(s.topReelViews)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function findDropoffSegment(segments: CompetitorTranscriptSegment[], targetSec: number): CompetitorTranscriptSegment | null {
  if (!segments.length) return null;
  let last: CompetitorTranscriptSegment | null = null;
  for (const seg of segments) {
    if (seg.start <= targetSec) last = seg;
    else break;
  }
  return last ?? segments[0];
}

function ReelCard({ reel }: { reel: CompetitorReel }) {
  const [expanded, setExpanded] = useState(false);
  const thumb = reel.driveFileId ? `https://drive.google.com/thumbnail?id=${reel.driveFileId}&sz=w200` : null;
  const cleanCaption = reel.caption ? reel.caption.slice(0, 100) + (reel.caption.length > 100 ? '…' : '') : '';

  return (
    <Card className="flex flex-col gap-3 p-3">
      <div className="flex items-start gap-3">
        {thumb && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={thumb} alt="" className="aspect-[9/16] w-20 shrink-0 rounded-md object-cover bg-[color:var(--color-surface-muted)]" loading="lazy" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
            <span className="font-medium text-[color:var(--color-text-primary)]">@{reel.username}</span>
            <span>•</span>
            <span>{formatDate(reel.postedAt)}</span>
            {reel.permalink && (
              <a href={reel.permalink} target="_blank" rel="noopener noreferrer" className="text-[color:var(--color-accent)] hover:underline">
                IGで開く
              </a>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-[color:var(--color-text-primary)]">
            {cleanCaption || '(キャプションなし)'}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            <span><span className="text-[color:var(--color-text-muted)]">再生</span> <span className="font-semibold text-[color:var(--color-text-primary)]">{num(reel.viewCount)}</span></span>
            <span><span className="text-[color:var(--color-text-muted)]">いいね</span> <span className="font-semibold text-[color:var(--color-text-primary)]">{num(reel.likeCount)}</span></span>
            <span><span className="text-[color:var(--color-text-muted)]">コメ</span> <span className="font-semibold text-[color:var(--color-text-primary)]">{num(reel.commentsCount)}</span></span>
            {reel.transcriptSegments.length > 0 && (
              <span><span className="text-[color:var(--color-text-muted)]">台本</span> <span className="font-semibold text-[color:var(--color-text-primary)]">{reel.transcriptSegments.length}行</span></span>
            )}
          </div>
          {reel.transcriptSegments.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded((p) => !p)}
              className="mt-1 text-xs font-medium text-[color:var(--color-accent)] hover:underline"
            >
              {expanded ? '台本を閉じる' : '台本全文を表示'}
            </button>
          )}
        </div>
      </div>
      {expanded && reel.transcriptSegments.length > 0 && (
        <div className="max-h-72 overflow-y-auto rounded border border-[color:var(--color-border)] bg-white p-2 text-xs">
          {reel.transcriptSegments.map((seg, idx) => (
            <div key={idx} className="flex gap-2 py-0.5">
              <span className="w-12 shrink-0 tabular-nums text-[color:var(--color-text-muted)]">{seg.start.toFixed(1)}s</span>
              <span className="text-[color:var(--color-text-primary)]">{seg.text}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function CompetitorTab({ data }: Props) {
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const accounts = useMemo(
    () => Array.from(new Set(data.accountSummaries.map((s) => s.username))),
    [data.accountSummaries],
  );
  const filteredReels = useMemo(
    () => (accountFilter === 'all' ? data.topReels : data.topReels.filter((r) => r.username === accountFilter)),
    [data.topReels, accountFilter],
  );

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">フォロワー推移（直近120日）</h2>
            <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
              競合 {data.accountSummaries.length}アカウント、最終更新 {formatDate(data.lastUpdatedAt)}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <FollowerChart series={data.followerSeries} />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">アカウントランキング</h2>
        <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">フォロワー数降順。クリックで Instagram プロフィール</p>
        <div className="mt-4">
          <AccountSummaryTable summaries={data.accountSummaries} />
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">勝ち投稿 TOP（再生数順）</h2>
            <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
              直近120日 × 上位{data.topReels.length}件 / 文字起こし展開可
            </p>
          </div>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
          >
            <option value="all">全アカウント</option>
            {accounts.map((u) => (
              <option key={u} value={u}>@{u}</option>
            ))}
          </select>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredReels.map((reel) => (
            <ReelCard key={`${reel.username}-${reel.instagramMediaId}`} reel={reel} />
          ))}
          {filteredReels.length === 0 && (
            <p className="col-span-full py-12 text-center text-sm text-[color:var(--color-text-muted)]">
              該当アカウントのリールデータがありません
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
