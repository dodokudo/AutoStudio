"use client";

import useSWR from 'swr';
import { useEffect, useMemo, useState } from 'react';
import { PostQueue } from './post-queue';
import type { ThreadPlanSummary } from '@/types/threadPlan';

interface PostQueueContainerProps {
  initialPlans: ThreadPlan[];
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
  return {
    id: plan.plan_id,
    scheduledTime: plan.scheduled_time,
    templateId: plan.template_id,
    theme: plan.theme,
    status: plan.status,
    mainText: plan.main_text,
    comments: (() => {
      try {
        const parsed = JSON.parse(plan.comments ?? '[]');
        if (Array.isArray(parsed)) {
          return parsed as { order: number; text: string }[];
        }
      } catch (error) {
        console.warn('Failed to parse comments', error);
      }
      return [] as { order: number; text: string }[];
    })(),
    jobStatus: plan.job_status,
    jobUpdatedAt: plan.job_updated_at,
    jobErrorMessage: plan.job_error_message,
    logStatus: plan.log_status,
    logErrorMessage: plan.log_error_message,
    logPostedThreadId: plan.log_posted_thread_id,
    logPostedAt: plan.log_posted_at,
  };
}

export function PostQueueContainer({ initialPlans }: PostQueueContainerProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const { data, mutate } = useSWR<PlansResponse>('/api/threads/plans', fetcher, {
    fallbackData: { items: initialPlans },
    revalidateOnFocus: false,
  });

  const plans = useMemo(() => data?.items ?? [], [data?.items]);
  const planKey = plans.map((plan) => plan.plan_id).join('|');
  const [drafts, setDrafts] = useState<Record<string, { scheduledTime: string; mainText: string }>>({});

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      plans.forEach((plan) => {
        if (!next[plan.plan_id]) {
          next[plan.plan_id] = {
            scheduledTime: plan.scheduled_time,
            mainText: plan.main_text,
          };
        }
      });
      return next;
    });
  }, [planKey, plans]);

  const handleAction = async (id: string, action: 'approve' | 'reject') => {
    setPendingId(id);
    try {
      const res = await fetch(`/api/threads/plans/${id}/${action}`, {
        method: 'POST',
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const { plan } = (await res.json()) as { plan: ThreadPlan };
      mutate(
        (prev) =>
          prev
            ? {
                items: prev.items.map((item) => (item.plan_id === plan.plan_id ? plan : item)),
              }
            : prev,
        { revalidate: false },
      );
    } catch (error) {
      console.error('Plan action failed', error);
      alert('処理に失敗しました');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <PostQueue
      items={plans.map(normalize)}
      pendingId={pendingId}
      onApprove={(id) => handleAction(id, 'approve')}
      onReject={(id) => handleAction(id, 'reject')}
      onDraftChange={(id, change) => {
        setDrafts((current) => ({
          ...current,
          [id]: {
            scheduledTime: change.scheduledTime ?? current[id]?.scheduledTime ?? plans.find((p) => p.plan_id === id)?.scheduled_time ?? '07:00',
            mainText: change.mainText ?? current[id]?.mainText ?? plans.find((p) => p.plan_id === id)?.main_text ?? '',
          },
        }));
      }}
      onSave={async (id, changes) => {
        setPendingId(id);
        try {
          const res = await fetch('/api/threads/plans', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planId: id, scheduledTime: changes.scheduledTime, mainText: changes.mainText }),
          });
          if (!res.ok) {
            throw new Error(await res.text());
          }
          const { plan } = (await res.json()) as { plan: ThreadPlan };
          mutate(
            (prev) =>
              prev
                ? {
                    items: prev.items.map((item) => (item.plan_id === plan.plan_id ? plan : item)),
                  }
                : prev,
            { revalidate: false },
          );
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
    />
  );
}
