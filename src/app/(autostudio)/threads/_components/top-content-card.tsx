'use client';

import { useState } from 'react';
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

interface TopContentCardProps {
  posts: Array<{
    id: string;
    content: string;
    views: number;
    likes: number;
    replies: number;
    postedAt: string;
    commentData?: PostCommentData[];
  }>;
  sortOption: SortOption;
  onSortChange: (option: SortOption) => void;
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

function cleanContent(text: string) {
  // 【メイン投稿】などのプレフィックスを除去
  return text.replace(/^【メイン投稿】\s*/g, '').replace(/^【コメント\d+】\s*/g, '');
}

function truncateText(text: string, maxLength = 80) {
  const cleaned = cleanContent(text);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength)}…`;
}

function PostCard({ post, isExpanded, onToggle, rank }: {
  post: TopContentCardProps['posts'][number];
  isExpanded: boolean;
  onToggle: () => void;
  rank?: number;
}) {
  const isTop10 = rank !== undefined && rank <= 10;
  const commentData = post.commentData ?? [];
  const hasComments = commentData.length > 0;
  const { transitions: transitionRates, overallRate } = calculateTransitionRates(post.views, commentData);

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
          <span>返信 {post.replies.toLocaleString()}</span>
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
    </div>
  );
}

export function TopContentCard({ posts, sortOption, onSortChange }: TopContentCardProps) {
  const [showAll, setShowAll] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

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
    </Card>
  );
}
