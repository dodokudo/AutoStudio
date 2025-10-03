"use client";

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import type { PlanStatus } from '@/types/threadPlan';
import { classNames } from '@/lib/classNames';

interface QueueItem {
  id: string;
  generationDate: string;
  scheduledTime: string;
  templateId: string;
  theme: string;
  mainText: string;
  comments: { order: number; text: string }[];
  status: PlanStatus;
  jobStatus?: string;
  jobUpdatedAt?: string;
  jobErrorMessage?: string;
  logStatus?: string;
  logErrorMessage?: string;
  logPostedThreadId?: string;
  logPostedAt?: string;
}

interface TemplateOption {
  value: string;
  label: string;
}

interface PostQueueProps {
  items: QueueItem[];
  onApprove?: (id: string) => Promise<void> | void;
  onReject?: (id: string) => Promise<void> | void;
  onSave?: (
    id: string,
    changes: {
      scheduledTime: string;
      mainText: string;
      templateId: string;
      theme: string;
      comments: { order: number; text: string }[];
    },
  ) => Promise<void> | void;
  onDraftChange?: (id: string, changes: { scheduledTime?: string; mainText?: string; templateId?: string; theme?: string }) => void;
  onCommentChange?: (id: string, comments: { order: number; text: string }[]) => void;
  onRerun?: (id: string) => Promise<void> | void;
  editableValues?: Record<
    string,
    {
      scheduledTime: string;
      mainText: string;
      templateId: string;
      theme: string;
      comments: { order: number; text: string }[];
    }
  >;
  pendingId?: string | null;
  templateOptions?: TemplateOption[];
  variant?: 'standalone' | 'embedded';
}

const statusLabel: Record<PlanStatus, string> = {
  draft: '下書き',
  approved: '承認済み',
  scheduled: '予約済み',
  rejected: '差戻し済み',
  posted: '投稿済み',
};

const statusBadgeClass: Record<PlanStatus, string> = {
  draft: 'bg-[#fff4e5] text-[#ad6800]',
  approved: 'bg-[#e6f7ed] text-[#096c3e]',
  scheduled: 'bg-[#e6f4ff] text-[#0a5dc2]',
  rejected: 'bg-[#fdeded] text-[#a61b1b]',
  posted: 'bg-[#f0f0f0] text-[#4a5568]',
};

const scheduleOptions = Array.from({ length: 48 }).map((_, index) => {
  const baseMinutes = index * 30;
  const hour = Math.floor(baseMinutes / 60)
    .toString()
    .padStart(2, '0');
  const minute = (baseMinutes % 60).toString().padStart(2, '0');
  return `${hour}:${minute}`;
});

export function PostQueue({
  items,
  onApprove,
  onReject,
  onSave,
  onDraftChange,
  onCommentChange,
  onRerun,
  editableValues = {},
  pendingId,
  templateOptions = [],
  variant = 'standalone',
}: PostQueueProps) {
  const isTextTooLong = (mainText: string, comments: { text: string }[]) => {
    if (mainText.length > 500) return true;
    return comments.some((comment) => comment.text.length > 500);
  };
  const summary = items.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    },
    { total: 0, draft: 0, approved: 0, scheduled: 0, rejected: 0 } as Record<PlanStatus | 'total', number>,
  );

  const showHeader = variant === 'standalone';

  const header = showHeader ? (
    <header className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center sm:justify-between gap-4 max-w-full overflow-hidden">
      <div className="max-w-full min-w-0">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)] break-words">本日の投稿キュー</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)] break-words">
          承認後は指定した時間に自動で配信されます。内容を確認のうえ、必要に応じて編集してください。
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-secondary)] max-w-full">
        <span className="rounded-full bg-[#f2f4f7] px-3 py-1">計 {summary.total} 件</span>
        <span className="rounded-full bg-[#e6f7ed] px-3 py-1 text-[#096c3e]">承認済 {summary.approved}</span>
        <span className="rounded-full bg-[#fff4e5] px-3 py-1 text-[#ad6800]">承認待ち {summary.draft}</span>
        <span className="rounded-full bg-[#e6f4ff] px-3 py-1 text-[#0a5dc2]">予約 {summary.scheduled}</span>
      </div>
    </header>
  ) : null;

  const listContent = items.length === 0 ? (
    <div className={showHeader ? 'mt-6' : 'mt-4'}>
      <EmptyState title="投稿案はまだありません" description="上部の「投稿案を再生成」から案を作成してください。" />
    </div>
  ) : (
    <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
      {items.map((item) => {
        const templateListId = `template-options-${item.id}`;
        const draft = editableValues[item.id] ?? item;
        const isPending = pendingId === item.id;
        const hasTextError = isTextTooLong(draft.mainText, draft.comments);

        return (
          <div
            key={item.id}
            className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-white p-5 shadow-[var(--shadow-soft)]"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-text-secondary)]">
              <span className="rounded-full bg-[#f2f4f7] px-2.5 py-1 text-[11px] font-medium">
                配信日 {item.generationDate}
              </span>
              <span className={classNames('rounded-full px-2.5 py-1 text-[11px] font-medium', statusBadgeClass[item.status])}>
                {statusLabel[item.status]}
              </span>
            </div>

            <div className="mt-4 flex w-full min-w-0 flex-col items-start gap-3 text-xs text-[color:var(--color-text-secondary)] sm:flex-row sm:flex-wrap sm:items-center">
              <label className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
                <span className="font-medium whitespace-nowrap">時間</span>
                <input
                  type="time"
                  className="h-8 flex-1 min-w-0 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)] sm:flex-initial"
                  value={draft.scheduledTime}
                  onChange={(event) => onDraftChange?.(item.id, { scheduledTime: event.target.value })}
                  list={`time-options-${item.id}`}
                />
                <datalist id={`time-options-${item.id}`}>
                  {scheduleOptions.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </label>
              <label className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
                <span className="font-medium whitespace-nowrap">テンプレート</span>
                <input
                  className="h-8 flex-1 min-w-0 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)] sm:flex-initial"
                  list={templateOptions.length ? templateListId : undefined}
                  value={draft.templateId}
                  onChange={(event) =>
                    onDraftChange?.(item.id, {
                      templateId: event.target.value,
                    })
                  }
                />
                {templateOptions.length ? (
                  <datalist id={templateListId}>
                    {templateOptions.map((option) => (
                      <option key={`${item.id}-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </datalist>
                ) : null}
              </label>
            </div>

            <textarea
              className={classNames(
                'mt-4 w-full max-w-full min-w-0 rounded-[var(--radius-md)] border px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)] break-words',
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
                <div
                  key={comment.order}
                  className="w-full min-w-0 max-w-full overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3"
                >
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
                    className="w-full max-w-full min-w-0 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)] break-words"
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
            </div>

            <div className="mt-5 flex w-full min-w-0 flex-wrap items-center gap-2 max-w-full">
              {onRerun ? (
                <Button variant="secondary" onClick={() => onRerun(item.id)} disabled={isPending}>
                  {isPending ? '再作成中…' : '再作成'}
                </Button>
              ) : null}
              {onSave ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    onSave(item.id, {
                      scheduledTime: draft.scheduledTime,
                      mainText: draft.mainText,
                      templateId: draft.templateId,
                      theme: draft.theme,
                      comments: draft.comments ?? item.comments,
                    })
                  }
                  disabled={isPending || hasTextError}
                >
                  {isPending ? '保存中…' : '保存'}
                </Button>
              ) : null}
              {onApprove && item.status !== 'approved' && item.status !== 'scheduled' ? (
                <Button onClick={() => onApprove(item.id)} disabled={isPending || hasTextError}>
                  {isPending ? '承認中…' : '承認'}
                </Button>
              ) : null}
              {onReject && item.status !== 'rejected' ? (
                <Button variant="secondary" onClick={() => onReject(item.id)} disabled={isPending}>
                  {isPending ? '処理中…' : '差戻し'}
                </Button>
              ) : null}
            </div>

            {(item.jobStatus || item.logStatus) && (
              <div className="mt-4 space-y-2 rounded-[var(--radius-md)] bg-[color:var(--color-surface-muted)] p-3 text-xs text-[color:var(--color-text-secondary)]">
                {item.jobStatus ? (
                  <p>
                    <span className="font-medium text-[color:var(--color-text-primary)]">ジョブ状態</span>: {item.jobStatus}
                    {item.jobUpdatedAt ? ` (${new Date(item.jobUpdatedAt).toLocaleString()})` : ''}
                    {item.jobErrorMessage ? (
                      <span className="ml-2 break-all text-[#a61b1b]">{item.jobErrorMessage}</span>
                    ) : null}
                  </p>
                ) : null}
                {item.logStatus ? (
                  <p>
                    <span className="font-medium text-[color:var(--color-text-primary)]">最終結果</span>: {item.logStatus}
                    {item.logPostedAt ? ` (${new Date(item.logPostedAt).toLocaleString()})` : ''}
                    {item.logPostedThreadId ? (
                      <span className="ml-2 break-all text-[color:var(--color-accent)]">Thread ID: {item.logPostedThreadId}</span>
                    ) : null}
                    {item.logErrorMessage ? (
                      <span className="ml-2 break-all text-[#a61b1b]">{item.logErrorMessage}</span>
                    ) : null}
                  </p>
                ) : null}
              </div>
            )}
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
