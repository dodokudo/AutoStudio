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
  trendingThemes?: string[];
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

export function PostQueueContainer({ initialPlans, trendingThemes = [], templateOptions = [] }: PostQueueContainerProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const { data, mutate } = useSWR<PlansResponse>('/api/threads/plans', fetcher, {
    fallbackData: { items: initialPlans },
    revalidateOnFocus: false,
  });

  const plans = useMemo(() => data?.items ?? [], [data?.items]);
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
      const res = await fetch(`/api/threads/plans/${id}/${action}`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      await mutate();
      setDrafts((curr) => {
        const rest = { ...curr };
        delete rest[id];
        return rest;
      });
    } catch (error) {
      console.error('Plan action failed', error);
      alert('処理に失敗しました');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <PostQueue
      items={normalizedPlans}
      pendingId={pendingId}
      onApprove={(id) => handleAction(id, 'approve')}
      onReject={(id) => handleAction(id, 'reject')}
      onDraftChange={(id, change) => {
        const base = normalizedPlans.find((plan) => plan.id === id);
        if (!base) return;
        setDrafts((current) => {
          const existing = current[id] ?? {
            scheduledTime: base.scheduledTime,
            mainText: base.mainText,
            templateId: base.templateId,
            theme: base.theme,
            comments: base.comments,
          };
          return {
            ...current,
            [id]: {
              scheduledTime: change.scheduledTime ?? existing.scheduledTime,
              mainText: change.mainText ?? existing.mainText,
              templateId: change.templateId ?? existing.templateId,
              theme: change.theme ?? existing.theme,
              comments: existing.comments,
            },
          };
        });
      }}
      onSave={async (id, changes) => {
        setPendingId(id);
        try {
          const res = await fetch('/api/threads/plans', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              planId: id,
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
          setDrafts((curr) => {
            const rest = { ...curr };
            delete rest[id];
            return rest;
          });
          setDrafts((curr) => ({
            ...curr,
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
          alert('保存に失敗しました');
        } finally {
          setPendingId(null);
        }
      }}
      onRerun={async (id) => {
        setPendingId(id);
        try {
          const res = await fetch(`/api/threads/plans/${id}/rerun`, {
            method: 'POST',
          });
          if (!res.ok) {
            throw new Error(await res.text());
          }
          await mutate();
        } catch (error) {
          console.error('Plan rerun failed', error);
          alert('再実行に失敗しました');
        } finally {
          setPendingId(null);
        }
      }}
      editableValues={drafts}
      onCommentChange={(id, comments) => {
        const base = normalizedPlans.find((plan) => plan.id === id);
        if (!base) return;
        setDrafts((current) => {
          const existing = current[id] ?? {
            scheduledTime: base.scheduledTime,
            mainText: base.mainText,
            templateId: base.templateId,
            theme: base.theme,
            comments: base.comments,
          };
          return {
            ...current,
            [id]: {
              ...existing,
              comments,
            },
          };
        });
      }}
      trendingThemes={trendingThemes}
      templateOptions={templateOptions}
    />
  );
}
