"use client";

import useSWR from 'swr';
import { useState } from 'react';
import { PostQueue } from './post-queue';
import type { ThreadPlan } from '@/types/threadPlan';

interface PostQueueContainerProps {
  initialPlans: ThreadPlan[];
}

interface PlansResponse {
  items: ThreadPlan[];
}

const fetcher = async (url: string): Promise<PlansResponse> => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error('Failed to fetch plans');
  }
  return res.json();
};

function normalize(plan: ThreadPlan) {
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
  };
}

export function PostQueueContainer({ initialPlans }: PostQueueContainerProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const { data, mutate } = useSWR<PlansResponse>('/api/threads/plans', fetcher, {
    fallbackData: { items: initialPlans },
    revalidateOnFocus: false,
  });

  const plans = data?.items ?? [];

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
    />
  );
}
