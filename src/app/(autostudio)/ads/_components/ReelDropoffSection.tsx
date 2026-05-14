'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import type { ReelAdInsightRow } from '@/lib/ads/reelInsights';

interface Props {
  rows: ReelAdInsightRow[];
}

function num(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('ja-JP');
}

function pct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toFixed(digits)}%`;
}

function yen(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

function audienceBadge(type: string | null): { label: string; color: string } {
  switch (type) {
    case 'retargeting':
      return { label: 'リターゲ', color: 'bg-[rgba(10,122,255,0.12)] text-[color:var(--color-accent)]' };
    case 'lookalike':
      return { label: 'Lookalike', color: 'bg-[rgba(255,176,32,0.12)] text-[color:var(--color-warning)]' };
    case 'cold':
      return { label: 'コールド', color: 'bg-[rgba(25,195,125,0.12)] text-[color:var(--color-success)]' };
    case 'mixed':
      return { label: 'ミックス', color: 'bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-secondary)]' };
    default:
      return { label: '—', color: 'bg-[color:var(--color-surface-muted)] text-[color:var(--color-text-muted)]' };
  }
}

function RetentionBar({ label, value, total }: { label: string; value: number; total: number }) {
  const pctValue = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-12 shrink-0 text-xs text-[color:var(--color-text-muted)] tabular-nums">{label}</span>
      <div className="relative h-5 flex-1 overflow-hidden rounded bg-[color:var(--color-surface-muted)]">
        <div
          className="absolute inset-y-0 left-0 bg-[color:var(--color-accent)]"
          style={{ width: `${Math.min(100, pctValue)}%` }}
        />
      </div>
      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-[color:var(--color-text-secondary)]">
        {num(value)} ({pct(pctValue)})
      </span>
    </div>
  );
}

function RetentionCard({ row, base }: { row: { adsetName: string | null; audienceType: string | null; impressions: number; videoPlays: number; p2s: number; p15s: number; p25: number; p50: number; p75: number; p95: number; p100: number; spend: number; }; base: number }) {
  const badge = audienceBadge(row.audienceType);
  return (
    <div className="rounded-md border border-[color:var(--color-border)] bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-medium text-[color:var(--color-text-primary)]">{row.adsetName ?? '(無名 adset)'}</div>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.color}`}>{badge.label}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-text-muted)]">
        <span>消化: {yen(row.spend)}</span>
        <span>imp: {num(row.impressions)}</span>
        <span>再生: {num(row.videoPlays)}</span>
      </div>
      <div className="mt-3 space-y-1">
        <RetentionBar label="再生" value={row.videoPlays} total={base} />
        <RetentionBar label="15s" value={row.p15s} total={base} />
        <RetentionBar label="25%" value={row.p25} total={base} />
        <RetentionBar label="50%" value={row.p50} total={base} />
        <RetentionBar label="75%" value={row.p75} total={base} />
        <RetentionBar label="95%" value={row.p95} total={base} />
        <RetentionBar label="100%" value={row.p100} total={base} />
      </div>
    </div>
  );
}

function PermalinkRow({ row }: { row: ReelAdInsightRow }) {
  const totalP15s = row.byAdset.reduce((sum, a) => sum + (a.p15s ?? 0), 0);
  const totalP95 = row.byAdset.reduce((sum, a) => sum + (a.p95 ?? 0), 0);
  const base = row.totalVideoPlays > 0 ? row.totalVideoPlays : Math.max(row.totalImpressions, 1);

  return (
    <Card className="p-4">
      <div className="flex items-start gap-4">
        {row.thumbnailUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={row.thumbnailUrl} alt="" className="aspect-[9/16] w-32 shrink-0 rounded-md object-cover" loading="lazy" />
        )}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-medium text-[color:var(--color-text-primary)] line-clamp-1">
              {row.adName ?? row.permalink ?? '(no name)'}
            </div>
            {row.permalink && (
              <a
                href={row.permalink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-[color:var(--color-accent)] hover:underline"
              >
                Instagramで開く →
              </a>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs md:grid-cols-7">
            <div><div className="text-[color:var(--color-text-muted)]">消化</div><div className="font-semibold text-[color:var(--color-text-primary)]">{yen(row.totalSpend)}</div></div>
            <div><div className="text-[color:var(--color-text-muted)]">imp</div><div className="font-semibold text-[color:var(--color-text-primary)]">{num(row.totalImpressions)}</div></div>
            <div><div className="text-[color:var(--color-text-muted)]">CTR</div><div className="font-semibold text-[color:var(--color-text-primary)]">{pct(row.ctr * 100, 2)}</div></div>
            <div><div className="text-[color:var(--color-text-muted)]">リンククリック</div><div className="font-semibold text-[color:var(--color-text-primary)]">{num(row.totalInlineLinkClicks)}</div></div>
            <div><div className="text-[color:var(--color-text-muted)]">LINE登録</div><div className="font-semibold text-[color:var(--color-text-primary)]">{num(row.totalLeads)}</div></div>
            <div><div className="text-[color:var(--color-text-muted)]">CPA</div><div className="font-semibold text-[color:var(--color-text-primary)]">{row.cpa !== null ? yen(row.cpa) : '—'}</div></div>
            <div><div className="text-[color:var(--color-text-muted)]">CVR</div><div className="font-semibold text-[color:var(--color-text-primary)]">{row.cvr !== null ? pct(row.cvr * 100, 2) : '—'}</div></div>
          </div>
          <div className="rounded-md border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3">
            <div className="mb-2 text-xs font-medium text-[color:var(--color-text-primary)]">広告全体の視聴維持カーブ</div>
            <div className="space-y-1">
              <RetentionBar label="再生" value={row.totalVideoPlays} total={base} />
              <RetentionBar label="15s" value={totalP15s} total={base} />
              <RetentionBar label="25%" value={row.totalP25} total={base} />
              <RetentionBar label="50%" value={row.totalP50} total={base} />
              <RetentionBar label="75%" value={row.totalP75} total={base} />
              <RetentionBar label="95%" value={totalP95} total={base} />
              <RetentionBar label="100%" value={row.totalP100} total={base} />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {row.byAdset.map((adset) => (
          <RetentionCard key={adset.adsetId} row={adset} base={Math.max(adset.videoPlays, adset.impressions, 1)} />
        ))}
      </div>
    </Card>
  );
}

export function ReelDropoffSection({ rows }: Props) {
  const [filter, setFilter] = useState<'all' | 'retargeting' | 'cold' | 'lookalike'>('all');

  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows
      .map((row) => ({
        ...row,
        byAdset: row.byAdset.filter((a) => a.audienceType === filter),
      }))
      .filter((row) => row.byAdset.length > 0);
  }, [rows, filter]);

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">クリエイティブ別成果</h2>
          </div>
          <div className="flex gap-2 text-xs">
            {(['all', 'retargeting', 'cold', 'lookalike'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setFilter(opt)}
                className={`rounded px-3 py-1 ${
                  filter === opt
                    ? 'bg-[color:var(--color-accent)] text-white'
                    : 'border border-[color:var(--color-border)] text-[color:var(--color-text-secondary)]'
                }`}
              >
                {opt === 'all' ? '全て' : opt === 'retargeting' ? 'リターゲ' : opt === 'cold' ? 'コールド' : 'Lookalike'}
              </button>
            ))}
          </div>
        </div>
      </Card>
      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-[color:var(--color-text-muted)]">
          該当期間にリール広告データがありません
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((row) => (
            <PermalinkRow key={row.permalink ?? row.adName ?? ''} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}
