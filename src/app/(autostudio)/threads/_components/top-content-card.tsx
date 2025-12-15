'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';

type SortOption = 'postedAt' | 'views' | 'likes';

interface TopContentCardProps {
  posts: Array<{
    id: string;
    content: string;
    views: number;
    likes: number;
    replies: number;
    postedAt: string;
  }>;
  sortOption: SortOption;
  onSortChange: (option: SortOption) => void;
}

const INITIAL_DISPLAY_COUNT = 20;



function cleanContent(text: string) {
  // 【メイン投稿】などのプレフィックスを除去
  return text.replace(/^【メイン投稿】\s*/g, '').replace(/^【コメント\d+】\s*/g, '');
}

function truncateText(text: string, maxLength = 80) {
  const cleaned = cleanContent(text);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength)}…`;
}

function PostCard({ post, isExpanded, onToggle }: {
  post: TopContentCardProps['posts'][number];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-3 shadow-[var(--shadow-soft)] cursor-pointer"
      onClick={onToggle}
    >
      <div className="flex items-center justify-between text-xs text-[color:var(--color-text-muted)]">
        <span>{new Date(post.postedAt).toLocaleString('ja-JP', {
          timeZone: 'Asia/Tokyo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}</span>
        <div className="flex items-center gap-3">
          <span>閲覧 {post.views.toLocaleString()}</span>
          <span>いいね {post.likes.toLocaleString()}</span>
          <span>返信 {post.replies.toLocaleString()}</span>
        </div>
      </div>
      <p className="mt-1 text-sm text-[color:var(--color-text-primary)] whitespace-pre-wrap">
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
            {displayedPosts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                isExpanded={expandedIds.has(post.id)}
                onToggle={() => toggleExpanded(post.id)}
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
