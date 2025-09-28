'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import type { ThreadPlanSummary } from '@/types/threadPlan';

interface PostedContentProps {
  initialPostedPlans?: ThreadPlanSummary[];
}

export function PostedContent({ initialPostedPlans = [] }: PostedContentProps) {
  const [postedPlans, setPostedPlans] = useState<ThreadPlanSummary[]>(initialPostedPlans);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPostedPlans = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/plans/posted');
      if (response.ok) {
        const data = await response.json();
        setPostedPlans(data.plans || []);
      }
    } catch (error) {
      console.error('Failed to fetch posted plans:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialPostedPlans.length === 0) {
      fetchPostedPlans();
    }
  }, [initialPostedPlans.length]);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('ja-JP', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const parseComments = (commentsString: string) => {
    try {
      const parsed = JSON.parse(commentsString);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [];
    } catch {
      return [];
    }
  };

  return (
    <Card>
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">投稿済みコンテンツ</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
            これまでに投稿されたコンテンツの履歴を確認できます。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#f0f0f0] px-3 py-1 text-xs text-[#4a5568]">
            計 {postedPlans.length} 件
          </span>
          <Button variant="secondary" onClick={fetchPostedPlans} disabled={isLoading}>
            {isLoading ? '更新中…' : '更新'}
          </Button>
        </div>
      </header>

      {postedPlans.length === 0 ? (
        <EmptyState title="投稿済みコンテンツはありません" description="投稿が完了すると、ここに表示されます。" />
      ) : (
        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          {postedPlans.map((plan) => {
            const comments = parseComments(plan.comments || '[]');

            return (
              <div
                key={plan.plan_id}
                className="flex h-full flex-col rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-white p-5 shadow-[var(--shadow-soft)]"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-text-secondary)]">
                  <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1 text-[11px] font-medium">
                    配信日 {plan.generation_date}
                  </span>
                  <span className="rounded-full bg-[#f0f0f0] px-2.5 py-1 text-[11px] font-medium text-[#4a5568]">
                    投稿済み
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-text-secondary)]">
                  <span>時間: {plan.scheduled_time}</span>
                  <span>テンプレート: {plan.template_id}</span>
                </div>

                <div className="mt-4 flex-1">
                  <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white p-3 text-sm">
                    <div className="whitespace-pre-wrap text-[color:var(--color-text-primary)]">
                      {plan.main_text}
                    </div>
                  </div>

                  {comments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {comments.map((comment: { order: number; text: string }, index: number) => (
                        <div
                          key={index}
                          className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3"
                        >
                          <div className="mb-1 text-xs font-medium text-[color:var(--color-text-primary)]">
                            コメント {comment.order}
                          </div>
                          <div className="text-sm text-[color:var(--color-text-secondary)] whitespace-pre-wrap">
                            {comment.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {(plan.log_posted_thread_id || plan.log_posted_at) && (
                  <div className="mt-4 rounded-[var(--radius-md)] bg-[color:var(--color-surface-muted)] p-3 text-xs text-[color:var(--color-text-secondary)]">
                    {plan.log_posted_thread_id && (
                      <p>
                        <span className="font-medium text-[color:var(--color-text-primary)]">Thread ID</span>: {plan.log_posted_thread_id}
                      </p>
                    )}
                    {plan.log_posted_at && (
                      <p className="mt-1">
                        <span className="font-medium text-[color:var(--color-text-primary)]">投稿日時</span>: {formatDate(plan.log_posted_at)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}