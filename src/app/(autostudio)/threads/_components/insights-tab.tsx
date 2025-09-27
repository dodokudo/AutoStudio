'use client';

import { useState } from 'react';
import type { PostInsight } from '@/lib/threadsInsightsData';

interface InsightsTabProps {
  insights: PostInsight[];
}

export function InsightsTab({ insights }: InsightsTabProps) {
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());

  const toggleExpanded = (planId: string) => {
    const newExpanded = new Set(expandedPosts);
    if (newExpanded.has(planId)) {
      newExpanded.delete(planId);
    } else {
      newExpanded.add(planId);
    }
    setExpandedPosts(newExpanded);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (insights.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white/60 p-8 text-center shadow-sm dark:border-slate-700 dark:bg-white/5">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          投稿済みのコンテンツがありません
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {insights.map((post) => {
        const isExpanded = expandedPosts.has(post.planId);

        return (
          <div
            key={post.planId}
            className="rounded-2xl border border-slate-200 bg-white/60 shadow-sm transition-all hover:shadow-md dark:border-slate-700 dark:bg-white/5"
          >
            {/* Post Header */}
            <div className="flex items-center justify-between p-6">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    {post.templateId}
                  </span>
                  <span className="text-sm text-slate-600 dark:text-slate-400">
                    {post.theme}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-500">
                  投稿日時: {formatDate(post.postedAt)}
                </p>
              </div>

              {/* Future: Add metrics here */}
              <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
                <div className="text-center">
                  <p className="font-medium">-</p>
                  <p className="text-xs">インプレッション</p>
                </div>
                <div className="text-center">
                  <p className="font-medium">-</p>
                  <p className="text-xs">いいね</p>
                </div>
                <button
                  onClick={() => toggleExpanded(post.planId)}
                  className="ml-4 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                >
                  {isExpanded ? '閉じる' : '詳細'}
                </button>
              </div>
            </div>

            {/* Post Content */}
            {isExpanded && (
              <div className="border-t border-slate-200 px-6 py-4 dark:border-slate-700">
                {/* Main Post */}
                <div className="space-y-4">
                  <div>
                    <h4 className="text-sm font-medium text-slate-900 dark:text-white">
                      メイン投稿
                    </h4>
                    <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
                      {post.mainText}
                    </div>
                  </div>

                  {/* Comments */}
                  {post.comments.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-900 dark:text-white">
                        コメント ({post.comments.length}件)
                      </h4>
                      <div className="mt-2 space-y-2">
                        {post.comments.map((comment, index) => (
                          <div
                            key={index}
                            className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
                          >
                            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                              <span>コメント {index + 1}</span>
                            </div>
                            <div className="mt-1">{comment}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Thread Link */}
                  <div className="pt-2">
                    <a
                      href={`https://www.threads.net/t/${post.postedThreadId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Threadsで見る
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}