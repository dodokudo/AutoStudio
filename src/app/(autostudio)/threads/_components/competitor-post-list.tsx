'use client';

import { useMemo, useState } from 'react';

import type { CompetitorPostWithViews } from '@/lib/threadsResearchViews';

export type CompetitorPostSort = 'views' | 'postedAt' | 'replies';

interface CompetitorPostListProps {
  posts: CompetitorPostWithViews[];
  loading: boolean;
  error: string | null;
  usernames: string[];
  accountFilter: string;
  onAccountFilterChange: (username: string) => void;
  dateFilter: string | null;
  onDateFilterChange: (date: string | null) => void;
  sort: CompetitorPostSort;
  onSortChange: (sort: CompetitorPostSort) => void;
}

const INITIAL_DISPLAY_COUNT = 30;
const numberFormat = new Intl.NumberFormat('ja-JP');
const dateTimeFormat = new Intl.DateTimeFormat('ja-JP', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Tokyo',
});
const shortDateFormat = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' });

function shortDate(date: string): string {
  return shortDateFormat.format(new Date(`${date}T12:00:00+09:00`));
}

export function CompetitorPostList({
  posts,
  loading,
  error,
  usernames,
  accountFilter,
  onAccountFilterChange,
  dateFilter,
  onDateFilterChange,
  sort,
  onSortChange,
}: CompetitorPostListProps) {
  const [showAll, setShowAll] = useState(false);
  const [minViews, setMinViews] = useState<number>(0);

  const filtered = useMemo(() => {
    const list = posts.filter(
      (post) =>
        (accountFilter === 'all' || post.username === accountFilter) &&
        (!dateFilter || post.postDate === dateFilter) &&
        (post.viewsCount ?? 0) >= minViews
    );
    list.sort((left, right) => {
      switch (sort) {
        case 'postedAt':
          return right.postedAt.localeCompare(left.postedAt);
        case 'replies':
          return right.otherReplyCount - left.otherReplyCount || (right.viewsCount ?? 0) - (left.viewsCount ?? 0);
        default:
          return (right.viewsCount ?? -1) - (left.viewsCount ?? -1) || right.postedAt.localeCompare(left.postedAt);
      }
    });
    return list;
  }, [accountFilter, dateFilter, minViews, posts, sort]);

  const displayed = showAll ? filtered : filtered.slice(0, INITIAL_DISPLAY_COUNT);
  const selectClass =
    'h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]';

  return (
    <section
      id="competitor-post-list"
      className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 sm:p-6"
    >
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="font-bold text-[color:var(--color-text-primary)]">競合の投稿一覧</h3>
          <p className="mt-1 text-xs leading-5 text-[color:var(--color-text-secondary)]">
            閲覧数は投稿ページの表示を毎朝読み取った実数（丸めあり）。本文は全文です。
            {posts.length > 0 && ` ${numberFormat.format(filtered.length)}件`}
            {filtered.length > INITIAL_DISPLAY_COUNT && !showAll && `（${INITIAL_DISPLAY_COUNT}件を表示）`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={accountFilter} onChange={(event) => onAccountFilterChange(event.target.value)} className={selectClass}>
            <option value="all">全アカウント</option>
            {usernames.map((username) => (
              <option key={username} value={username}>
                @{username}
              </option>
            ))}
          </select>
          <select value={minViews} onChange={(event) => setMinViews(Number(event.target.value))} className={selectClass}>
            <option value={0}>閲覧数 すべて</option>
            <option value={3000}>3,000以上</option>
            <option value={10000}>1万以上</option>
            <option value={30000}>3万以上</option>
            <option value={100000}>10万以上</option>
          </select>
          <select value={sort} onChange={(event) => onSortChange(event.target.value as CompetitorPostSort)} className={selectClass}>
            <option value="views">閲覧数</option>
            <option value="replies">リプ数</option>
            <option value="postedAt">投稿日</option>
          </select>
          {dateFilter && (
            <button
              type="button"
              onClick={() => onDateFilterChange(null)}
              className="inline-flex h-9 items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-3 text-xs font-medium text-amber-900"
            >
              {shortDate(dateFilter)}の投稿だけ ×
            </button>
          )}
        </div>
      </header>

      {error && (
        <p role="alert" className="mt-4 rounded-[var(--radius-sm)] border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {loading && posts.length === 0 && (
        <p className="mt-4 text-sm text-[color:var(--color-text-secondary)]">投稿を読み込んでいます…</p>
      )}
      {!loading && filtered.length === 0 && !error && (
        <p className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-5 text-center text-sm text-[color:var(--color-text-secondary)]">
          条件に合う投稿がありません。
        </p>
      )}

      {displayed.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
          {displayed.map((post, index) => (
            <article
              key={post.postId}
              className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-text-secondary)]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-[color:var(--color-text-primary)]">#{index + 1}</span>
                  <span className="font-medium text-[color:var(--color-text-primary)]">@{post.username}</span>
                  <span>{post.postedAt ? dateTimeFormat.format(new Date(post.postedAt)) : post.postDate}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`tabular-nums ${(post.viewsCount ?? 0) >= 10000 ? 'font-bold text-amber-900' : ''}`}>
                    閲覧 {post.viewsCount === null ? '–' : numberFormat.format(post.viewsCount)}
                  </span>
                  <span className="tabular-nums">リプ {numberFormat.format(post.otherReplyCount)}</span>
                  {post.permalink && (
                    <a
                      href={post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)]"
                    >
                      投稿を開く
                    </a>
                  )}
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[color:var(--color-text-primary)]">
                {post.text.trim() || '（本文なし）'}
              </p>
            </article>
          ))}
        </div>
      )}

      {filtered.length > INITIAL_DISPLAY_COUNT && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="inline-flex h-9 items-center justify-center rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 text-sm font-medium text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-surface-muted)]"
          >
            {showAll ? '30件に戻す' : `すべて表示（${numberFormat.format(filtered.length)}件）`}
          </button>
        </div>
      )}
    </section>
  );
}
