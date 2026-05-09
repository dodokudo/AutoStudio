"use client";

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import type { PlanStatus } from '@/types/threadPlan';
import { classNames } from '@/lib/classNames';

interface QueueItem {
  id: string;
  scheduledTime: string;
  scheduledAt: string;
  templateId: string;
  theme: string;
  mainText: string;
  comments: { order: number; text: string }[];
  status: PlanStatus;
}

interface PostQueueProps {
  items: QueueItem[];
  onSaveDraft?: (
    id: string,
    changes: {
      scheduledTime: string;
      scheduledAt: string;
      mainText: string;
      templateId: string;
      theme: string;
      comments: { order: number; text: string }[];
    },
  ) => Promise<void> | void;
  onDraftChange?: (id: string, changes: { scheduledTime?: string; scheduledAt?: string; mainText?: string; templateId?: string; theme?: string }) => void;
  onCommentChange?: (id: string, comments: { order: number; text: string }[]) => void;
  onSchedule?: (
    id: string,
    payload: {
      scheduledAt: string;
      mainText: string;
      comments: { order: number; text: string }[];
    },
  ) => Promise<void> | void;
  onPublishNow?: (
    id: string,
    payload: {
      mainText: string;
      comments: { order: number; text: string }[];
    },
  ) => Promise<void> | void;
  editableValues?: Record<
    string,
    {
      scheduledTime: string;
      scheduledAt: string;
      mainText: string;
      templateId: string;
      theme: string;
      comments: { order: number; text: string }[];
    }
  >;
  pendingId?: string | null;
  variant?: 'standalone' | 'embedded';
}

const statusLabel: Record<PlanStatus, string> = {
  draft: '下書き',
  approved: '承認済み',
  scheduled: '予約済み',
  rejected: '差戻し',
  posted: '投稿済み',
};

const statusBadgeClass: Record<PlanStatus, string> = {
  draft: 'bg-[#fff4e5] text-[#ad6800]',
  approved: 'bg-[#e6f7ed] text-[#096c3e]',
  scheduled: 'bg-[#e6f4ff] text-[#0a5dc2]',
  rejected: 'bg-[#fdeded] text-[#a61b1b]',
  posted: 'bg-[#f0f0f0] text-[#4a5568]',
};

export function PostQueue({
  items,
  onSaveDraft,
  onDraftChange,
  onCommentChange,
  onSchedule,
  onPublishNow,
  editableValues = {},
  pendingId,
  variant = 'standalone',
}: PostQueueProps) {
  const isTextTooLong = (mainText: string, comments: { text: string }[]) => {
    if (mainText.length > 500) return true;
    return comments.some((comment) => comment.text.length > 500);
  };
  const showHeader = variant === 'standalone';

  const header = showHeader ? (
    <header className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center sm:justify-between gap-4 max-w-full overflow-hidden">
      <div className="max-w-full min-w-0">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)] break-words">本日の投稿キュー</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)] break-words">
          承認後は指定した時間に自動で配信されます。内容を確認のうえ、必要に応じて編集してください。
        </p>
      </div>
      <div className="rounded-full bg-[#f2f4f7] px-3 py-1 text-xs text-[color:var(--color-text-secondary)]">計 {items.length} 件</div>
    </header>
  ) : null;

  const listContent = items.length === 0 ? (
    <div className={showHeader ? 'mt-6' : 'mt-4'}>
      <EmptyState title="投稿案はまだありません" description="上部の「投稿案を再生成」から案を作成してください。" />
    </div>
  ) : (
    <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
      {items.map((item) => {
        const draft = editableValues[item.id] ?? item;
        const isPending = pendingId === item.id;
        const hasTextError = isTextTooLong(draft.mainText, draft.comments);
        const hasRequiredCommentError = (draft.comments ?? []).filter((comment) => comment.text.trim()).length < 2;

        return (
          <div
            key={item.id}
            className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-white p-5 shadow-[var(--shadow-soft)]"
          >
            <div className="flex flex-wrap items-end gap-3 text-xs text-[color:var(--color-text-secondary)]">
              <label className="block w-full min-w-0 sm:w-[17rem]">
                <span className="flex items-center gap-2 font-medium">
                  予約日時（JST）
                  <span className={classNames('rounded-full px-2 py-0.5 text-[10px] font-medium', statusBadgeClass[item.status])}>
                    {statusLabel[item.status]}
                  </span>
                </span>
                <input
                  type="datetime-local"
                  className="mt-2 h-10 w-full min-w-0 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                  value={draft.scheduledAt}
                  onChange={(event) => {
                    const nextScheduledAt = event.target.value;
                    onDraftChange?.(item.id, {
                      scheduledAt: nextScheduledAt,
                      scheduledTime: nextScheduledAt.split('T')[1]?.slice(0, 5) ?? draft.scheduledTime,
                    });
                  }}
                />
              </label>
              <Button
                className="h-10 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => onPublishNow?.(item.id, { mainText: draft.mainText, comments: draft.comments ?? item.comments })}
                disabled={isPending || hasTextError || hasRequiredCommentError}
              >
                {isPending ? '投稿中…' : '今すぐ投稿'}
              </Button>
            </div>

            <textarea
              className={classNames(
                'mt-4 w-full max-w-full min-w-0 rounded-[var(--radius-md)] border px-3 py-3 text-sm focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)] break-words',
                hasTextError ? 'border-[#ffb4b4]' : 'border-[color:var(--color-border)]',
              )}
              rows={6}
              value={draft.mainText}
              onChange={(event) => onDraftChange?.(item.id, { mainText: event.target.value })}
              maxLength={600}
            />
            <p className="mt-1 text-right text-[11px] text-[color:var(--color-text-muted)]">{draft.mainText.length}/500</p>

            <div className="mt-4 w-full min-w-0 max-w-full space-y-3 overflow-hidden text-sm text-[color:var(--color-text-secondary)]">
              {draft.comments.map((comment) => (
                <div key={comment.order} className="w-full min-w-0 max-w-full overflow-hidden">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-[color:var(--color-text-primary)]">コメント {comment.order}</span>
                    <button
                      type="button"
                      className="text-xs text-[color:var(--color-accent)] hover:text-[color:var(--color-accent-hover)]"
                      onClick={() => {
                        const next = (draft.comments ?? []).filter((c) => c.order !== comment.order);
                        onCommentChange?.(item.id, next);
                      }}
                    >
                      削除
                    </button>
                  </div>
                  <textarea
                    className="w-full max-w-full min-w-0 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-white px-3 py-3 text-sm focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)] break-words min-h-[18rem] md:min-h-[12rem]"
                    rows={4}
                    value={comment.text}
                    onChange={(event) => {
                      const next = (draft.comments ?? []).map((c) =>
                        c.order === comment.order ? { ...c, text: event.target.value } : c,
                      );
                      onCommentChange?.(item.id, next);
                    }}
                    maxLength={600}
                  />
                  <p className="mt-1 text-right text-[11px] text-[color:var(--color-text-muted)]">{comment.text.length}/500</p>
                </div>
              ))}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-xs font-medium text-[color:var(--color-accent)] hover:text-[color:var(--color-accent-hover)]"
                  onClick={() => {
                    const existing = draft.comments ?? [];
                    const nextOrder = existing.length ? Math.max(...existing.map((c) => c.order)) + 1 : 1;
                    const next = [...existing, { order: nextOrder, text: '' }];
                    onCommentChange?.(item.id, next);
                  }}
                >
                  コメントを追加
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  {onSaveDraft ? (
                    <Button
                      variant="secondary"
                      onClick={() =>
                        onSaveDraft(item.id, {
                          scheduledTime: draft.scheduledTime,
                          scheduledAt: draft.scheduledAt,
                          mainText: draft.mainText,
                          templateId: draft.templateId,
                          theme: draft.theme,
                          comments: draft.comments ?? item.comments,
                        })
                      }
                      disabled={isPending || hasTextError}
                    >
                      {isPending ? '保存中…' : '下書き保存'}
                    </Button>
                  ) : null}
                  {onSchedule ? (
                    <Button
                      onClick={() =>
                        onSchedule(item.id, {
                          scheduledAt: draft.scheduledAt,
                          mainText: draft.mainText,
                          comments: draft.comments ?? item.comments,
                        })
                      }
                      disabled={isPending || hasTextError || hasRequiredCommentError || !draft.scheduledAt}
                    >
                      {isPending ? '登録中…' : '予約登録'}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-5 flex w-full min-w-0 flex-wrap items-center gap-2 max-w-full">
            </div>
          </div>
        );
      })}
    </div>
  );

  if (showHeader) {
    return (
      <Card>
        {header}
        {listContent}
      </Card>
    );
  }

  return <div className="w-full">{listContent}</div>;
}
