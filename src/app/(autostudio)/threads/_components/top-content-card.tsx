'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card } from '@/components/ui/card';

type SortOption = 'postedAt' | 'views' | 'likes';

interface PostCommentData {
  commentId: string;
  parentPostId: string;
  text: string;
  timestamp: string;
  depth: number;
  views: number;
}

type TopContentPost = {
  id: string;
  content: string;
  views: number;
  likes: number;
  replies: number;
  postedAt: string;
  commentData?: PostCommentData[];
};

interface TopContentCardProps {
  posts: TopContentPost[];
  sortOption: SortOption;
  onSortChange: (option: SortOption) => void;
}

const COMMENT_SLOT_LIMIT = 7;
const TEXT_LENGTH_LIMIT = 500;

type ReservationEligibility =
  | { eligible: true }
  | { eligible: false; reason: string };

function cleanContent(text: string) {
  return text.replace(/^【メイン投稿】\s*/g, '').replace(/^【コメント\d+】\s*/g, '');
}

function evaluateEligibility(post: TopContentPost): ReservationEligibility {
  const cleanedMain = cleanContent(post.content ?? '').trim();
  if (!cleanedMain) {
    return { eligible: false, reason: '本文空' };
  }
  if (cleanedMain.length > TEXT_LENGTH_LIMIT) {
    return { eligible: false, reason: '本文500字超' };
  }
  const comments = post.commentData ?? [];
  if (comments.length < 2) {
    return { eligible: false, reason: 'コメ<2' };
  }
  const effectiveComments = comments.slice(0, COMMENT_SLOT_LIMIT);
  const tooLong = effectiveComments.find((c) => cleanContent(c.text ?? '').length > TEXT_LENGTH_LIMIT);
  if (tooLong) {
    return { eligible: false, reason: 'コメ500字超' };
  }
  return { eligible: true };
}

function getDefaultScheduledAt() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 60);
  now.setSeconds(0);
  now.setMilliseconds(0);
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = now.getFullYear();
  const m = pad(now.getMonth() + 1);
  const d = pad(now.getDate());
  const hh = pad(now.getHours());
  const mm = pad(now.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

const INITIAL_DISPLAY_COUNT = 20;

interface TransitionRate {
  from: string;
  to: string;
  rate: number;
  views: number;
}

interface TransitionResult {
  transitions: TransitionRate[];
  overallRate: number | null; // メイン→最終コメント欄の遷移率
  lastCommentViews: number | null;
}

function calculateTransitionRates(postViews: number, comments: PostCommentData[]): TransitionResult {
  if (comments.length === 0 || postViews === 0) {
    return { transitions: [], overallRate: null, lastCommentViews: null };
  }

  const sortedComments = [...comments].sort((a, b) => a.depth - b.depth);
  const transitions: TransitionRate[] = [];

  // メイン投稿 → コメント欄1
  if (sortedComments.length > 0) {
    const firstComment = sortedComments[0];
    const rate = (firstComment.views / postViews) * 100;
    transitions.push({
      from: 'メイン',
      to: 'コメント欄1',
      rate,
      views: firstComment.views,
    });
  }

  // コメント欄1 → コメント欄2, ...
  for (let i = 1; i < sortedComments.length; i++) {
    const prevComment = sortedComments[i - 1];
    const currComment = sortedComments[i];
    if (prevComment.views > 0) {
      const rate = (currComment.views / prevComment.views) * 100;
      transitions.push({
        from: `コメント欄${i}`,
        to: `コメント欄${i + 1}`,
        rate,
        views: currComment.views,
      });
    }
  }

  // メイン→最終コメント欄の全体遷移率
  const lastComment = sortedComments[sortedComments.length - 1];
  const overallRate = postViews > 0 ? (lastComment.views / postViews) * 100 : null;

  return {
    transitions,
    overallRate,
    lastCommentViews: lastComment.views,
  };
}

function truncateText(text: string, maxLength = 80) {
  const cleaned = cleanContent(text);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength)}…`;
}

function PostCard({ post, isExpanded, onToggle, rank, onReserve }: {
  post: TopContentCardProps['posts'][number];
  isExpanded: boolean;
  onToggle: () => void;
  rank?: number;
  onReserve: (post: TopContentPost) => void;
}) {
  const isTop10 = rank !== undefined && rank <= 10;
  const commentData = post.commentData ?? [];
  const hasComments = commentData.length > 0;
  const { transitions: transitionRates, overallRate } = calculateTransitionRates(post.views, commentData);
  const eligibility = useMemo(() => evaluateEligibility(post), [post]);

  return (
    <div
      className={`rounded-[var(--radius-md)] border bg-white p-3 shadow-[var(--shadow-soft)] cursor-pointer ${
        isTop10
          ? 'border-amber-300 bg-amber-50/30'
          : 'border-[color:var(--color-border)]'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-center justify-between text-xs text-[color:var(--color-text-muted)]">
        <div className="flex items-center gap-2">
          {isTop10 && (
            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
              rank === 1 ? 'bg-yellow-400 text-yellow-900' :
              rank === 2 ? 'bg-gray-300 text-gray-700' :
              rank === 3 ? 'bg-amber-600 text-white' :
              'bg-amber-100 text-amber-700'
            }`}>
              {rank}
            </span>
          )}
          <span>{new Date(post.postedAt).toLocaleString('ja-JP', {
            timeZone: 'Asia/Tokyo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}</span>
          {hasComments && (
            <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
              コメント欄{commentData.length}つ
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span>閲覧 {post.views.toLocaleString()}</span>
          <span>いいね {post.likes.toLocaleString()}</span>
          <button
            type="button"
            disabled={!eligibility.eligible}
            title={eligibility.eligible ? '同じ内容で再投稿を予約' : eligibility.reason}
            onClick={(event) => {
              event.stopPropagation();
              if (eligibility.eligible) onReserve(post);
            }}
            className="rounded-full border border-[color:var(--color-accent)] bg-[color:var(--color-accent)] px-2.5 py-0.5 text-[11px] font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
          >
            {eligibility.eligible ? '再投稿' : eligibility.reason}
          </button>
        </div>
      </div>

      {/* コメント欄遷移率表示 */}
      {transitionRates.length > 0 && (
        <div className="mt-2 rounded-md bg-gradient-to-r from-purple-50 to-indigo-50 p-2 border border-purple-100">
          <div className="flex items-center gap-1 flex-wrap text-[10px]">
            {/* メイン投稿 */}
            <div className="flex flex-col items-center">
              <span className="text-gray-500">メイン</span>
              <span className="font-bold text-gray-700">{post.views.toLocaleString()}</span>
            </div>
            {transitionRates.map((t, idx) => {
              // 1投稿目から2投稿目（idx === 0: メイン→コメント欄1）は10%以上で緑
              // 2投稿目以降は80%以上で緑
              const isFirstTransition = idx === 0;
              const colorClass = isFirstTransition
                ? t.rate >= 10 ? 'text-green-600' : 'text-red-500'
                : t.rate >= 80 ? 'text-green-600' : t.rate >= 50 ? 'text-yellow-600' : 'text-red-500';

              return (
                <div key={idx} className="flex items-center gap-1">
                  <div className="flex flex-col items-center px-1">
                    <span className="text-gray-400">→</span>
                    <span className={`font-bold ${colorClass}`}>
                      {t.rate.toFixed(1)}%
                    </span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-gray-500">{t.to}</span>
                    <span className="font-bold text-gray-700">{t.views.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {/* メイン→最終コメント欄の全体遷移率 */}
          {overallRate !== null && transitionRates.length > 1 && (
            <div className="mt-1 pt-1 border-t border-purple-200 flex items-center gap-1 text-[10px]">
              <span className="text-gray-500">全体遷移率:</span>
              <span className={`font-bold ${overallRate >= 1 ? 'text-blue-600' : 'text-gray-500'}`}>
                {overallRate.toFixed(2)}%
              </span>
            </div>
          )}
        </div>
      )}

      <p className="mt-2 text-sm text-[color:var(--color-text-primary)] whitespace-pre-wrap">
        {isExpanded ? cleanContent(post.content) : truncateText(post.content)}
      </p>

      {/* コメント本文（展開時のみ表示） */}
      {isExpanded && hasComments && (
        <div className="mt-3 space-y-2 border-t border-gray-200 pt-3">
          <p className="text-xs font-medium text-gray-500">コメント欄</p>
          {commentData.map((comment, idx) => (
            <div
              key={comment.commentId}
              className="rounded-md bg-gray-50 p-2 text-xs"
            >
              <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-1">
                <span className="font-medium text-purple-600">コメント{idx + 1}</span>
                <span>閲覧 {comment.views.toLocaleString()}</span>
              </div>
              <p className="text-gray-700 whitespace-pre-wrap">{comment.text}</p>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

export function TopContentCard({ posts, sortOption, onSortChange }: TopContentCardProps) {
  const [showAll, setShowAll] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [reserveTarget, setReserveTarget] = useState<TopContentPost | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [portalMounted, setPortalMounted] = useState(false);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  const displayedPosts = showAll ? posts : posts.slice(0, INITIAL_DISPLAY_COUNT);
  const hasMore = posts.length > INITIAL_DISPLAY_COUNT;

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const openReserveModal = (post: TopContentPost) => {
    setReserveTarget(post);
    setScheduledAt(getDefaultScheduledAt());
    setSubmitError(null);
  };

  const closeReserveModal = () => {
    if (submitting) return;
    setReserveTarget(null);
    setSubmitError(null);
  };

  const handleSubmitReservation = async () => {
    if (!reserveTarget || !scheduledAt) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const comments = (reserveTarget.commentData ?? []).map((c) => cleanContent(c.text ?? ''));
      const mainText = cleanContent(reserveTarget.content ?? '');
      const body: Record<string, unknown> = {
        scheduledAt,
        mainText,
        comment1: comments[0] ?? '',
        comment2: comments[1] ?? '',
        comment3: comments[2] ?? '',
        comment4: comments[3] ?? '',
        comment5: comments[4] ?? '',
        comment6: comments[5] ?? '',
        comment7: comments[6] ?? '',
        comment8: '',
        status: 'scheduled',
      };
      const res = await fetch('/api/threads/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || '予約の登録に失敗しました');
      }
      setReserveTarget(null);
      setSuccessMessage('再投稿を予約しました。予約投稿タブで編集できます。');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '予約の登録に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <header className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">トップコンテンツ</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
            選択期間内で反応が高かった投稿を表示しています。
            {posts.length > 0 && ` (${showAll ? posts.length : Math.min(posts.length, INITIAL_DISPLAY_COUNT)}/${posts.length}件)`}
          </p>
        </div>
        <select
          value={sortOption}
          onChange={(event) => onSortChange(event.target.value as SortOption)}
          className="h-9 w-40 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
        >
          <option value="views">閲覧数</option>
          <option value="likes">いいね数</option>
          <option value="postedAt">投稿日</option>
        </select>
      </header>
      {successMessage && (
        <div className="mb-3 rounded-[var(--radius-sm)] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          {successMessage}
        </div>
      )}
      {posts.length === 0 ? (
        <p className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-5 text-center text-sm text-[color:var(--color-text-muted)]">
          データがありません。
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {displayedPosts.map((post, index) => (
              <PostCard
                key={post.id}
                post={post}
                isExpanded={expandedIds.has(post.id)}
                onToggle={() => toggleExpanded(post.id)}
                rank={index + 1}
                onReserve={openReserveModal}
              />
            ))}
          </div>
          {hasMore && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => setShowAll(!showAll)}
                className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white px-6 py-2 text-sm font-medium text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-surface-muted)]"
              >
                {showAll ? '閉じる' : `続きを見る (残り${posts.length - INITIAL_DISPLAY_COUNT}件)`}
              </button>
            </div>
          )}
        </>
      )}

      {portalMounted && reserveTarget && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeReserveModal}
        >
          <div
            className="w-full max-w-lg rounded-[var(--radius-md)] bg-white p-5 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">再投稿の予約</h3>
              <button
                type="button"
                className="text-sm text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]"
                onClick={closeReserveModal}
                disabled={submitting}
              >
                閉じる
              </button>
            </header>
            {(() => {
              const allComments = reserveTarget.commentData ?? [];
              const usedCount = Math.min(allComments.length, COMMENT_SLOT_LIMIT);
              const overflow = Math.max(0, allComments.length - COMMENT_SLOT_LIMIT);
              return (
                <p className="mb-3 text-xs text-[color:var(--color-text-secondary)]">
                  同じ本文とコメント{usedCount}件を指定日時に再投稿します。
                  {overflow > 0 ? `元の投稿はコメント${allComments.length}件ですが、再投稿は先頭${COMMENT_SLOT_LIMIT}件までです。` : ''}
                  登録後は予約投稿タブで編集できます。
                </p>
              );
            })()}
            <label className="mb-1 block text-xs font-medium text-[color:var(--color-text-secondary)]">
              投稿日時（JST）
            </label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              className="mb-3 h-10 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
              disabled={submitting}
            />
            <div className="mb-3 max-h-48 overflow-y-auto rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3 text-xs text-[color:var(--color-text-primary)]">
              <p className="mb-1 font-medium text-[color:var(--color-text-secondary)]">メイン</p>
              <p className="whitespace-pre-wrap">{cleanContent(reserveTarget.content ?? '')}</p>
              {(reserveTarget.commentData ?? []).slice(0, COMMENT_SLOT_LIMIT).map((c, idx) => (
                <div key={c.commentId ?? idx} className="mt-2">
                  <p className="mb-1 font-medium text-[color:var(--color-text-secondary)]">コメント{idx + 1}</p>
                  <p className="whitespace-pre-wrap">{cleanContent(c.text ?? '')}</p>
                </div>
              ))}
            </div>
            {submitError && (
              <div className="mb-3 rounded-[var(--radius-sm)] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {submitError}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeReserveModal}
                disabled={submitting}
                className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-4 py-2 text-sm text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-surface-muted)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSubmitReservation}
                disabled={submitting || !scheduledAt}
                className="rounded-[var(--radius-sm)] border border-[color:var(--color-accent)] bg-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? '登録中…' : '再投稿を予約'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </Card>
  );
}
