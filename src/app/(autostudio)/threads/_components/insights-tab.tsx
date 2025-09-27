'use client';

import type { PostInsight } from '@/lib/threadsInsightsData';

interface InsightsTabProps {
  insights: PostInsight[];
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function InsightsTab({ insights }: InsightsTabProps) {
  if (insights.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white/60 p-8 text-center shadow-sm dark:border-slate-700 dark:bg-white/5">
        <p className="text-sm text-slate-600 dark:text-slate-400">投稿済みのコンテンツがまだありません。</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/70 shadow-sm dark:border-slate-700 dark:bg-white/5">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
          <thead className="bg-slate-50/80 text-left text-xs font-medium uppercase tracking-wider text-slate-500 dark:bg-slate-800/60 dark:text-slate-300">
            <tr>
              <th className="px-5 py-3">投稿日時</th>
              <th className="px-5 py-3">インプレッション</th>
              <th className="px-5 py-3">いいね</th>
              <th className="px-5 py-3 text-right">Threads</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-sm text-slate-700 dark:divide-slate-700 dark:text-slate-200">
            {insights.map((post) => {
              const impressions = post.insights.impressions ?? 0;
              const likes = post.insights.likes ?? 0;
              return (
                <tr key={post.postedThreadId} className="odd:bg-white/70 even:bg-white/60 dark:odd:bg-slate-800/40 dark:even:bg-slate-800/20">
                  <td className="px-5 py-3 align-top">
                    <div className="flex flex-col gap-1">
                      <span className="font-medium text-slate-900 dark:text-white">{formatDateTime(post.postedAt)}</span>
                      {post.mainText ? (
                        <span className="line-clamp-2 text-xs text-slate-400 dark:text-slate-500">{post.mainText}</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-5 py-3 align-top font-semibold text-slate-900 dark:text-white">
                    {impressions ? impressions.toLocaleString() : '-'}
                  </td>
                  <td className="px-5 py-3 align-top font-semibold text-slate-900 dark:text-white">
                    {likes ? likes.toLocaleString() : '-'}
                  </td>
                  <td className="px-5 py-3 align-top text-right">
                    <a
                      href={`https://www.threads.net/t/${post.postedThreadId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                    >
                      詳細
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6h8m0 0v8m0-8L5 21" />
                      </svg>
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
