'use client';

import { useCallback, useMemo, useState } from 'react';

import { Card } from '@/components/ui/card';
import type { CompetitorPostWithViews } from '@/lib/threadsResearchViews';

export type CompetitorPostSort = 'views' | 'postedAt' | 'replies';

interface ThreadReply {
  text: string;
  depth: number;
  permalink: string;
}

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
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
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
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [replies, setReplies] = useState<Record<string, ThreadReply[]>>({});
  const [loadingReplyId, setLoadingReplyId] = useState<string | null>(null);
  const [replyErrors, setReplyErrors] = useState<Record<string, string>>({});

  const toggleExpanded = useCallback(
    async (post: CompetitorPostWithViews) => {
      const isOpen = expandedIds.has(post.postId);
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (isOpen) next.delete(post.postId);
        else next.add(post.postId);
        return next;
      });
      if (isOpen || replies[post.postId]) return;
      setLoadingReplyId(post.postId);
      try {
        // 保存済みのツリー（本人のリプ）を先に見て、無ければAPIから取りに行く
        const savedParams = new URLSearchParams({ userId: 'autostudio', postId: post.postId });
        const savedResponse = await fetch(`/api/threads/research/posts?${savedParams.toString()}`);
        const saved = (await savedResponse.json()) as { nodes?: { text: string; depth: number; permalink: string; isSelfReply: boolean }[]; error?: string };
        let list: ThreadReply[] = (saved.nodes ?? [])
          .filter((node) => node.isSelfReply)
          .sort((left, right) => left.depth - right.depth)
          .map((node) => ({ text: node.text, depth: node.depth, permalink: node.permalink }));
        if (list.length === 0) {
          const liveParams = new URLSearchParams({ postId: post.postId, username: post.username, postedAt: post.postedAt });
          const liveResponse = await fetch(`/api/threads/research/thread?${liveParams.toString()}`);
          const live = (await liveResponse.json()) as { replies?: ThreadReply[]; error?: string };
          if (!liveResponse.ok) throw new Error(live.error || 'コメント欄の取得に失敗しました');
          list = (live.replies ?? []).map((reply) => ({ text: reply.text, depth: reply.depth, permalink: reply.permalink }));
        }
        setReplies((prev) => ({ ...prev, [post.postId]: list }));
      } catch (error) {
        setReplyErrors((prev) => ({ ...prev, [post.postId]: error instanceof Error ? error.message : String(error) }));
      } finally {
        setLoadingReplyId(null);
      }
    },
    [expandedIds, replies]
  );

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
    <Card id="competitor-post-list">
      <header className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">競合の投稿一覧</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
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
            <div
              key={post.postId}
              onClick={() => void toggleExpanded(post)}
              className={`cursor-pointer rounded-[var(--radius-md)] border bg-white p-3 shadow-[var(--shadow-soft)] ${
                sort === 'views' && index < 10 ? 'border-amber-300 bg-amber-50/30' : 'border-[color:var(--color-border)]'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-text-muted)]">
                <div className="flex flex-wrap items-center gap-2">
                  {sort === 'views' && index < 10 && (
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                        index === 0
                          ? 'bg-yellow-400 text-yellow-900'
                          : index === 1
                            ? 'bg-gray-300 text-gray-700'
                            : index === 2
                              ? 'bg-amber-600 text-white'
                              : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {index + 1}
                    </span>
                  )}
                  <span>{post.postedAt ? dateTimeFormat.format(new Date(post.postedAt)) : post.postDate}</span>
                  <a
                    href={`https://www.threads.com/@${post.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 transition-colors hover:bg-blue-100 hover:text-blue-800"
                  >
                    @{post.username}
                  </a>
                  {replies[post.postId] && replies[post.postId].length > 0 && (
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                      コメント欄{replies[post.postId].length}つ
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span>閲覧 {post.viewsCount === null ? '–' : numberFormat.format(post.viewsCount)}</span>
                  <span>リプ {numberFormat.format(post.otherReplyCount)}</span>
                  {post.permalink && (
                    <a
                      href={post.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-accent)] hover:text-[color:var(--color-accent)]"
                    >
                      投稿を開く
                    </a>
                  )}
                </div>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[color:var(--color-text-primary)]">
                {post.text.trim() || '（本文なし）'}
              </p>
              {expandedIds.has(post.postId) && (
                <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
                  <p className="text-xs font-medium text-gray-500">コメント欄</p>
                  {loadingReplyId === post.postId && <p className="text-xs text-gray-400">読み込んでいます…</p>}
                  {replyErrors[post.postId] && <p className="text-xs text-red-700">{replyErrors[post.postId]}</p>}
                  {replies[post.postId] && replies[post.postId].length === 0 && (
                    <p className="text-xs text-gray-400">本人のコメント欄はありません。</p>
                  )}
                  {(replies[post.postId] ?? []).map((reply, replyIndex) => (
                    <div key={`${post.postId}-${replyIndex}`} className="rounded-md bg-gray-50 p-2 text-xs">
                      <div className="mb-1 flex items-center gap-2 text-[10px] text-gray-400">
                        <span className="font-medium text-purple-600">コメント{replyIndex + 1}</span>
                        {reply.permalink && (
                          <a
                            href={reply.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="hover:underline"
                          >
                            開く
                          </a>
                        )}
                      </div>
                      <p className="whitespace-pre-wrap text-gray-700">{reply.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
    </Card>
  );
}
