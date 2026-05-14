'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import type { ScriptEntry, ScriptLibraryData } from '@/lib/instagram/scriptLibrary';

interface Props {
  data: ScriptLibraryData;
}

function num(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return Math.round(value).toLocaleString('ja-JP');
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function ScriptCard({ entry }: { entry: ScriptEntry }) {
  const [expanded, setExpanded] = useState(false);
  const caption = entry.caption ? entry.caption.slice(0, 120) + (entry.caption.length > 120 ? '…' : '') : '';
  const preview = entry.rawText ? entry.rawText.slice(0, 160) + (entry.rawText.length > 160 ? '…' : '') : '';

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
        <span className="font-semibold text-[color:var(--color-text-primary)]">@{entry.username}</span>
        <span>•</span>
        <span>{formatDate(entry.postedAt)}</span>
        <span>•</span>
        <span>再生 {num(entry.views)}</span>
        <span>•</span>
        <span>いいね {num(entry.likes)}</span>
        <span>•</span>
        <span>{entry.transcriptSegments.length}行</span>
        {entry.permalink && (
          <>
            <span>•</span>
            <a href={entry.permalink} target="_blank" rel="noopener noreferrer" className="text-[color:var(--color-accent)] hover:underline">
              IGで開く
            </a>
          </>
        )}
      </div>
      {caption && (
        <p className="line-clamp-2 text-sm text-[color:var(--color-text-secondary)]">{caption}</p>
      )}
      <p className="line-clamp-3 text-sm text-[color:var(--color-text-primary)]">{preview}</p>
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="self-start text-xs font-medium text-[color:var(--color-accent)] hover:underline"
      >
        {expanded ? '台本を閉じる' : '台本全文を見る'}
      </button>
      {expanded && (
        <div className="max-h-96 overflow-y-auto rounded border border-[color:var(--color-border)] bg-white p-3 text-xs">
          {entry.transcriptSegments.map((seg, idx) => (
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

export function ScriptLibraryTab({ data }: Props) {
  const [keyword, setKeyword] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'self' | 'competitor'>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'views' | 'date'>('views');

  const accounts = useMemo(() => {
    return Array.from(new Set(data.entries.map((e) => e.username))).sort();
  }, [data.entries]);

  const filtered = useMemo(() => {
    let entries = data.entries;
    if (sourceFilter !== 'all') entries = entries.filter((e) => e.source === sourceFilter);
    if (accountFilter !== 'all') entries = entries.filter((e) => e.username === accountFilter);
    if (keyword.trim()) {
      const kw = keyword.trim().toLowerCase();
      entries = entries.filter((e) =>
        (e.rawText && e.rawText.toLowerCase().includes(kw)) ||
        (e.caption && e.caption.toLowerCase().includes(kw)) ||
        e.username.toLowerCase().includes(kw),
      );
    }
    return [...entries].sort((a, b) => {
      if (sortBy === 'views') return (b.views ?? 0) - (a.views ?? 0);
      const at = a.postedAt ? new Date(a.postedAt).getTime() : 0;
      const bt = b.postedAt ? new Date(b.postedAt).getTime() : 0;
      return bt - at;
    });
  }, [data.entries, sourceFilter, accountFilter, keyword, sortBy]);

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">台本ライブラリ</h2>
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
            競合 {data.competitorCount}件 + 自分 {data.selfCount}件 = 計{data.entries.length}件のリール文字起こし
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="キーワード検索（台本内・キャプション）"
            className="h-9 w-56 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
          />
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as 'all' | 'self' | 'competitor')}
            className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm"
          >
            <option value="all">全ソース</option>
            <option value="self">自分のみ</option>
            <option value="competitor">競合のみ</option>
          </select>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm"
          >
            <option value="all">全アカウント</option>
            {accounts.map((u) => (
              <option key={u} value={u}>@{u}</option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'views' | 'date')}
            className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm"
          >
            <option value="views">再生数順</option>
            <option value="date">投稿日順</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-8 py-12 text-center text-sm text-[color:var(--color-text-muted)]">該当する台本がありません</p>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((entry) => (
            <ScriptCard key={`${entry.source}-${entry.username}-${entry.instagramId}`} entry={entry} />
          ))}
        </div>
      )}
    </Card>
  );
}
