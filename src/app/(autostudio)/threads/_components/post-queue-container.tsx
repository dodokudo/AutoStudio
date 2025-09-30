"use client";

import useSWR from 'swr';
import { useEffect, useMemo, useState } from 'react';
import { PostQueue } from './post-queue';
import type { ThreadPlanSummary } from '@/types/threadPlan';

interface TemplateOption {
  value: string;
  label: string;
}

interface PostQueueContainerProps {
  initialPlans: ThreadPlanSummary[];
  templateOptions?: TemplateOption[];
}

interface PlansResponse {
  items: ThreadPlanSummary[];
}

const fetcher = async (url: string): Promise<PlansResponse> => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Failed to fetch plans');
  }
  return res.json();
};

function normalize(plan: ThreadPlanSummary) {
  const comments = (() => {
    try {
      const parsed = JSON.parse(plan.comments ?? '[]');
      if (Array.isArray(parsed)) {
        return (parsed as { order: number; text: string }[]).sort((a, b) => a.order - b.order);
      }
    } catch (error) {
      console.warn('Failed to parse comments', error);
    }
    return [] as { order: number; text: string }[];
  })();

  return {
    id: plan.plan_id,
    generationDate: plan.generation_date,
    scheduledTime: plan.scheduled_time,
    templateId: plan.template_id,
    theme: plan.theme,
    status: plan.status,
    mainText: plan.main_text,
    comments,
    jobStatus: plan.job_status,
    jobUpdatedAt: plan.job_updated_at,
    jobErrorMessage: plan.job_error_message,
    logStatus: plan.log_status,
    logErrorMessage: plan.log_error_message,
    logPostedThreadId: plan.log_posted_thread_id,
    logPostedAt: plan.log_posted_at,
  };
}

export function PostQueueContainer({ initialPlans, templateOptions = [] }: PostQueueContainerProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const { data, mutate, isValidating } = useSWR<PlansResponse>('/api/threads/plans', fetcher, {
    fallbackData: { items: initialPlans },
    revalidateOnFocus: false,
  });

  const plans = useMemo(() => data?.items ?? [], [data?.items]);
  const isLoading = !data && initialPlans.length === 0;
  const normalizedPlans = useMemo(() => plans.map(normalize), [plans]);
  const planKey = plans.map((plan) => plan.plan_id).join('|');
  const [drafts, setDrafts] = useState<
    Record<string, { scheduledTime: string; mainText: string; templateId: string; theme: string; comments: { order: number; text: string }[] }>
  >({});

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      normalizedPlans.forEach((plan) => {
        if (!next[plan.id]) {
          next[plan.id] = {
            scheduledTime: plan.scheduledTime,
            mainText: plan.mainText,
            templateId: plan.templateId,
            theme: plan.theme,
            comments: plan.comments,
          };
        }
      });
      return next;
    });
  }, [planKey, normalizedPlans]);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setPendingId(id);
    try {
      console.log(`[PostQueue] Starting ${action} for plan ${id}`);
      const res = await fetch(`/api/threads/plans/${id}/${action}`, { method: 'POST' });
      const responseData = await res.json();
      console.log(`[PostQueue] Response:`, responseData);

      if (!res.ok) {
        const errorMsg = responseData.error || 'Unknown error';
        console.error(`[PostQueue] ${action} failed:`, errorMsg);
        throw new Error(errorMsg);
      }

      // 成功時の詳細ログ
      if (action === 'approve') {
        console.log(`[PostQueue] Approve result:`, {
          published: responseData.published,
          status: responseData.plan?.status,
          error: responseData.publish_error
        });

        if (responseData.publish_error) {
          alert(`承認はされましたが、投稿に失敗しました: ${responseData.publish_error}`);
        } else if (responseData.published) {
          alert('投稿が完了しました！');
        }
      }

      await mutate();
      setDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } catch (error) {
      console.error(`[PostQueue] ${action} failed`, error);
      const errorMsg = error instanceof Error ? error.message : '不明なエラー';
      alert(`処理に失敗しました: ${errorMsg}`);
    } finally {
      setPendingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-24 rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="relative">
      {isValidating ? <div className="pointer-events-none absolute inset-0 rounded-[var(--radius-lg)] bg-white/70" /> : null}
      <PostQueue
        items={normalizedPlans}
        pendingId={pendingId}
        onApprove={(id) => handleAction(id, 'approve')}
        onReject={(id) => handleAction(id, 'reject')}
        onDraftChange={(id, change) => {
          setDrafts((current) => {
            const base = current[id] ?? normalizedPlans.find((plan) => plan.id === id);
            if (!base) return current;
            return {
              ...current,
              [id]: {
                scheduledTime: change.scheduledTime ?? base.scheduledTime,
                mainText: change.mainText ?? base.mainText,
                templateId: change.templateId ?? base.templateId,
                theme: change.theme ?? base.theme,
                comments: base.comments,
              },
            };
          });
        }}
        onSave={async (id, changes) => {
          setPendingId(id);
          try {
            const target = normalizedPlans.find((plan) => plan.id === id);
            const res = await fetch('/api/threads/plans', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                planId: id,
                generationDate: target?.generationDate,
                scheduledTime: changes.scheduledTime,
                mainText: changes.mainText,
                templateId: changes.templateId,
                theme: changes.theme,
                comments: changes.comments,
              }),
            });
            if (!res.ok) {
              throw new Error(await res.text());
            }
            await mutate();
            setDrafts((current) => {
              const next = { ...current };
              delete next[id];
              return next;
            });
            setDrafts((current) => ({
              ...current,
              [id]: {
                scheduledTime: changes.scheduledTime,
                mainText: changes.mainText,
                templateId: changes.templateId,
                theme: changes.theme,
                comments: changes.comments,
              },
            }));
          } catch (error) {
            console.error('Plan update failed', error);
            const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました';
            alert(`保存に失敗しました: ${errorMessage}`);
          } finally {
            setPendingId(null);
          }
        }}
        onRerun={async (id) => {
          setPendingId(id);
          try {
            const res = await fetch(`/api/threads/plans/${id}/rerun`, { method: 'POST' });
            if (!res.ok) {
              throw new Error(await res.text());
            }
            await mutate();
          } catch (error) {
            console.error('Plan rerun failed', error);
            alert('再生成に失敗しました');
          } finally {
            setPendingId(null);
          }
        }}
        editableValues={drafts}
        onCommentChange={(id, comments) => {
          setDrafts((current) => ({
            ...current,
            [id]: {
              ...(current[id] ?? normalizedPlans.find((plan) => plan.id === id)),
              comments,
            },
          }));
        }}
        templateOptions={templateOptions}
      />
    </div>
  );
}
