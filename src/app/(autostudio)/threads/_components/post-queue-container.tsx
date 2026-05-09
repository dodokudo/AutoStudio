"use client";

import useSWR from 'swr';
import { useEffect, useMemo, useState } from 'react';
import { PostQueue } from './post-queue';
import type { ThreadPlanSummary } from '@/types/threadPlan';

interface PostQueueContainerProps {
  initialPlans: ThreadPlanSummary[];
  variant?: 'standalone' | 'embedded';
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
    scheduledAt: `${plan.generation_date}T${(plan.scheduled_time || '09:00').slice(0, 5)}`,
    templateId: plan.template_id,
    theme: plan.theme,
    status: plan.status,
    mainText: plan.main_text,
    comments,
  };
}

export function PostQueueContainer({ initialPlans, variant = 'embedded' }: PostQueueContainerProps) {
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
    Record<string, { scheduledTime: string; scheduledAt: string; mainText: string; templateId: string; theme: string; comments: { order: number; text: string }[] }>
  >({});

  useEffect(() => {
    setDrafts((current) => {
      const next = { ...current };
      normalizedPlans.forEach((plan) => {
        if (!next[plan.id]) {
          next[plan.id] = {
            scheduledTime: plan.scheduledTime,
            scheduledAt: plan.scheduledAt,
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

  const toSchedulePayload = (mainText: string, comments: { order: number; text: string }[]) => {
    const sorted = [...comments].sort((a, b) => a.order - b.order).map((comment) => comment.text.trim());
    return {
      mainText,
      comment1: sorted[0] ?? '',
      comment2: sorted[1] ?? '',
      comment3: sorted[2] ?? '',
      comment4: sorted[3] ?? '',
      comment5: sorted[4] ?? '',
      comment6: sorted[5] ?? '',
      comment7: sorted[6] ?? '',
      comment8: sorted[7] ?? '',
    };
  };

  const handleSchedule = async (
    id: string,
    payload: { scheduledAt: string; mainText: string; comments: { order: number; text: string }[] },
  ) => {
    setPendingId(id);
    try {
      const res = await fetch('/api/threads/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: id,
          scheduledAt: payload.scheduledAt,
          status: 'scheduled',
          ...toSchedulePayload(payload.mainText, payload.comments),
        }),
      });
      const responseData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(responseData?.error || '予約登録に失敗しました');
      }
      alert('予約投稿に登録しました。予約投稿タブに反映されます。');
    } catch (error) {
      console.error('[PostQueue] schedule failed', error);
      const errorMsg = error instanceof Error ? error.message : '不明なエラー';
      alert(`予約登録に失敗しました: ${errorMsg}`);
    } finally {
      setPendingId(null);
    }
  };

  const handlePublishNow = async (
    id: string,
    payload: { mainText: string; comments: { order: number; text: string }[] },
  ) => {
    if (!confirm('今すぐ投稿しますか？')) return;
    setPendingId(id);
    try {
      const res = await fetch('/api/threads/schedule/publish-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toSchedulePayload(payload.mainText, payload.comments)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || '投稿に失敗しました');
      }
      alert('投稿が完了しました。');
    } catch (error) {
      console.error('[PostQueue] publish now failed', error);
      alert(error instanceof Error ? error.message : '投稿に失敗しました');
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
    <div className="relative w-full max-w-full overflow-hidden">
      {isValidating ? <div className="pointer-events-none absolute inset-0 rounded-[var(--radius-lg)] bg-white/70" /> : null}
      <PostQueue
        items={normalizedPlans}
        pendingId={pendingId}
        variant={variant}
        onDraftChange={(id, change) => {
          setDrafts((current) => {
            const base = current[id] ?? normalizedPlans.find((plan) => plan.id === id);
            if (!base) return current;
            return {
              ...current,
              [id]: {
                scheduledTime: change.scheduledTime ?? base.scheduledTime,
                scheduledAt: change.scheduledAt ?? base.scheduledAt,
                mainText: change.mainText ?? base.mainText,
                templateId: change.templateId ?? base.templateId,
                theme: change.theme ?? base.theme,
                comments: base.comments,
              },
            };
          });
        }}
        onSaveDraft={async (id, changes) => {
          setPendingId(id);
          try {
            const target = normalizedPlans.find((plan) => plan.id === id);
            const res = await fetch('/api/threads/plans', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                planId: id,
                generationDate: target?.scheduledAt.split('T')[0],
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
            setDrafts((current) => ({
              ...current,
              [id]: {
                scheduledTime: changes.scheduledTime,
                scheduledAt: changes.scheduledAt,
                mainText: changes.mainText,
                templateId: changes.templateId,
                theme: changes.theme,
                comments: changes.comments,
              },
            }));
          } catch (error) {
            console.error('Plan draft save failed', error);
            const errorMessage = error instanceof Error ? error.message : '不明なエラーが発生しました';
            alert(`下書き保存に失敗しました: ${errorMessage}`);
          } finally {
            setPendingId(null);
          }
        }}
        onSchedule={handleSchedule}
        onPublishNow={handlePublishNow}
        editableValues={drafts}
        onCommentChange={(id, comments) => {
          setDrafts((current) => {
            const base = current[id] ?? normalizedPlans.find((plan) => plan.id === id);
            if (!base) return current;
            return {
              ...current,
              [id]: {
                scheduledTime: base.scheduledTime,
                scheduledAt: base.scheduledAt,
                mainText: base.mainText,
                templateId: base.templateId,
                theme: base.theme,
                comments,
              },
            };
          });
        }}
      />
    </div>
  );
}
