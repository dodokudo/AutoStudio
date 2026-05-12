'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { LaunchkitLP } from '@/lib/launchkit/bigquery';

interface Props {
  mode: 'create' | 'edit';
  lp?: LaunchkitLP;
}

const GENRES = ['opt', 'seminar', 'consult', 'other'] as const;
const SOURCES = ['threads', 'instagram', 'ad', 'note', 'youtube', 'other'] as const;

export function LaunchkitLPForm({ mode, lp }: Props) {
  const router = useRouter();
  const [name, setName] = useState(lp?.name ?? '');
  const [slug, setSlug] = useState(lp?.slug ?? '');
  const [url, setUrl] = useState(lp?.url ?? '');
  const [genre, setGenre] = useState<string>(lp?.genre ?? 'opt');
  const [source, setSource] = useState<string>(lp?.source ?? 'threads');
  const [lineCtaUrl, setLineCtaUrl] = useState(lp?.lineCtaUrl ?? '');
  const [isActive, setIsActive] = useState(lp?.isActive ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const body = {
        name,
        slug,
        url,
        genre,
        source,
        line_cta_url: lineCtaUrl,
        is_active: isActive,
      };

      const endpoint = mode === 'create' ? '/api/launchkit/lps' : `/api/launchkit/lps/${lp!.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'failed');
      }

      router.push('/launchkit');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '失敗');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!lp) return;
    if (!confirm('このLPを無効化しますか?')) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/launchkit/lps/${lp.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('failed');
      router.push('/launchkit');
      router.refresh();
    } catch {
      setError('無効化に失敗');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-4 rounded border bg-white p-6">
      {error && <p className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div>
        <label className="block text-sm font-medium">LP名 *</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">slug *</label>
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          required
          placeholder="opt-5"
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">公開URL *</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
          placeholder="https://lkit.jp/opt-5"
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium">ジャンル</label>
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
          >
            {GENRES.map((g) => (
              <option key={g} value={g}>{g === 'opt' ? 'オプト' : g === 'seminar' ? 'セミナー' : g === 'consult' ? '個別相談' : 'その他'}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">流入元</label>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2"
          >
            {SOURCES.map((s) => (
              <option key={s} value={s}>{s === 'threads' ? 'Threads' : s === 'instagram' ? 'Instagram' : s === 'ad' ? 'Meta広告' : s === 'note' ? 'note' : s === 'youtube' ? 'YouTube' : 'その他'}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">LINE CTA URL (Lステップ直リンク)</label>
        <input
          type="url"
          value={lineCtaUrl}
          onChange={(e) => setLineCtaUrl(e.target.value)}
          placeholder="https://liff.line.me/..."
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </div>

      {mode === 'edit' && (
        <div>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span className="text-sm">有効</span>
          </label>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-[color:var(--color-text-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? '送信中...' : mode === 'create' ? '登録' : '更新'}
        </button>
        {mode === 'edit' && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className="rounded border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            無効化
          </button>
        )}
        <button
          type="button"
          onClick={() => router.push('/launchkit')}
          className="rounded border px-4 py-2 text-sm"
        >
          キャンセル
        </button>
      </div>
    </form>
  );
}
