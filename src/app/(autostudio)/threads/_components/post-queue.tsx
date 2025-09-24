"use client";

import type { PlanStatus } from '@/types/threadPlan';

interface QueueItem {
  id: string;
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
  onCommentChange?: (
    id: string,
    comments: { order: number; text: string }[],
  ) => void;
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
  trendingThemes?: string[];
  templateOptions?: TemplateOption[];
}

const statusLabel: Record<PlanStatus, string> = {
  draft: '下書き',
  approved: '承認済み',
  scheduled: '予約済み',
  rejected: '差戻し済み',
};

const statusColor: Record<PlanStatus, string> = {
  draft: 'text-amber-300',
  approved: 'text-emerald-400',
  scheduled: 'text-sky-400',
  rejected: 'text-rose-400',
};

const scheduleOptions = Array.from({ length: 12 }).map((_, index) => {
  const baseMinutes = 7 * 60 + index * 60;
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
  trendingThemes = [],
  templateOptions = [],
}: PostQueueProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">本日の投稿キュー</h2>
        <p className="text-xs text-slate-400">承認後に Threads API で順番に投稿されます</p>
      </header>
      <div className="space-y-4">
        {items.map((item) => {
          const templateListId = `template-options-${item.id}`;
          return (
            <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/30 p-5">
              <header className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                <select
                  className="bg-transparent text-inherit focus:outline-none"
                  value={editableValues[item.id]?.scheduledTime ?? item.scheduledTime}
                  onChange={(event) =>
                    onDraftChange?.(item.id, { scheduledTime: event.target.value })
                  }
                >
                  {scheduleOptions.map((option) => (
                    <option key={option} value={option} className="text-black">
                      {option}
                    </option>
                  ))}
                </select>
              </span>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                Template:
                <input
                  className="ml-2 w-24 bg-transparent text-inherit focus:outline-none"
                  list={templateOptions.length ? templateListId : undefined}
                  value={editableValues[item.id]?.templateId ?? item.templateId}
                  onChange={(event) =>
                    onDraftChange?.(item.id, {
                      templateId: event.target.value,
                    })
                  }
                />
              </span>
              {templateOptions.length ? (
                <datalist id={templateListId}>
                  {templateOptions.map((option) => (
                    <option key={`${item.id}-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </datalist>
              ) : null}
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                Theme:
                <input
                  className="ml-2 w-28 bg-transparent text-inherit focus:outline-none"
                  value={editableValues[item.id]?.theme ?? item.theme}
                  onChange={(event) =>
                    onDraftChange?.(item.id, {
                      theme: event.target.value,
                    })
                  }
                />
              </span>
              <span className={`ml-auto text-xs font-semibold ${statusColor[item.status]}`}>
                {statusLabel[item.status]}
              </span>
            </header>
            <textarea
              className="mt-3 w-full rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-400"
              rows={4}
              value={editableValues[item.id]?.mainText ?? item.mainText}
              onChange={(event) =>
                onDraftChange?.(item.id, { mainText: event.target.value })
              }
            />
            {trendingThemes.length ? (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                {trendingThemes.map((theme) => (
                  <button
                    key={`${item.id}-theme-${theme}`}
                    type="button"
                    className="rounded-full border border-slate-700 px-3 py-1 text-slate-300 hover:bg-slate-800"
                    onClick={() =>
                      onDraftChange?.(item.id, {
                        theme,
                      })
                    }
                  >
                    {theme}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-4 space-y-3 text-sm text-slate-300">
              {(editableValues[item.id]?.comments ?? item.comments).map((comment) => (
                <div key={comment.order} className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-400">コメント{comment.order}</span>
                    <button
                      type="button"
                      className="text-rose-300 hover:text-rose-200"
                      onClick={() => {
                        const next = (editableValues[item.id]?.comments ?? item.comments).filter(
                          (c) => c.order !== comment.order,
                        );
                        onCommentChange?.(item.id, next);
                      }}
                    >
                      削除
                    </button>
                  </div>
                  <textarea
                    className="w-full rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                    rows={2}
                    value={comment.text}
                    onChange={(event) => {
                      const next = (editableValues[item.id]?.comments ?? item.comments).map((c) =>
                        c.order === comment.order ? { ...c, text: event.target.value } : c,
                      );
                      onCommentChange?.(item.id, next);
                    }}
                  />
                </div>
              ))}
              <button
                type="button"
                className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800"
                onClick={() => {
                  const existing = editableValues[item.id]?.comments ?? item.comments;
                  const nextOrder = existing.length ? Math.max(...existing.map((c) => c.order)) + 1 : 1;
                  const next = [...existing, { order: nextOrder, text: '' }];
                  onCommentChange?.(item.id, next);
                }}
              >
                コメントを追加
              </button>
            </div>
            {(onApprove || onReject || onSave || onRerun) && (
              <div className="mt-4 flex flex-wrap gap-3">
                {onRerun ? (
                  <button
                    type="button"
                    onClick={() => onRerun(item.id)}
                    disabled={pendingId === item.id}
                    className="rounded-lg bg-purple-500/20 px-3 py-2 text-xs font-semibold text-purple-300 transition hover:bg-purple-500/30 disabled:opacity-50"
                  >
                    {pendingId === item.id ? '再実行中…' : '再投稿ジョブ作成'}
                  </button>
                ) : null}
                {onSave ? (
                  <button
                    type="button"
                    onClick={() =>
                      onSave(item.id, {
                        scheduledTime: editableValues[item.id]?.scheduledTime ?? item.scheduledTime,
                        mainText: editableValues[item.id]?.mainText ?? item.mainText,
                        templateId: editableValues[item.id]?.templateId ?? item.templateId,
                        theme: editableValues[item.id]?.theme ?? item.theme,
                        comments: editableValues[item.id]?.comments ?? item.comments,
                      })
                    }
                    disabled={pendingId === item.id}
                    className="rounded-lg bg-sky-500/20 px-3 py-2 text-xs font-semibold text-sky-300 transition hover:bg-sky-500/30 disabled:opacity-50"
                  >
                    {pendingId === item.id ? '保存中…' : '変更を保存'}
                  </button>
                ) : null}
                {onApprove && item.status !== 'approved' && item.status !== 'scheduled' ? (
                  <button
                    type="button"
                    onClick={() => onApprove(item.id)}
                    disabled={pendingId === item.id}
                    className="rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/30 disabled:opacity-50"
                  >
                    {pendingId === item.id ? '処理中…' : '承認する'}
                  </button>
                ) : null}
                {onReject && item.status !== 'rejected' ? (
                  <button
                    type="button"
                    onClick={() => onReject(item.id)}
                    disabled={pendingId === item.id}
                    className="rounded-lg bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/30 disabled:opacity-50"
                  >
                    {pendingId === item.id ? '処理中…' : '差し戻す'}
                  </button>
                ) : null}
              </div>
            )}
            {(item.jobStatus || item.logStatus) && (
              <div className="mt-4 grid gap-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-xs text-slate-300">
                {item.jobStatus ? (
                  <p>
                    <span className="font-semibold text-slate-200">ジョブ状態:</span> {item.jobStatus}
                    {item.jobUpdatedAt ? ` (${new Date(item.jobUpdatedAt).toLocaleString()})` : ''}
                    {item.jobErrorMessage ? (
                      <span className="ml-2 text-rose-300">{item.jobErrorMessage}</span>
                    ) : null}
                  </p>
                ) : null}
                {item.logStatus ? (
                  <p>
                    <span className="font-semibold text-slate-200">最終結果:</span> {item.logStatus}
                    {item.logPostedAt ? ` (${new Date(item.logPostedAt).toLocaleString()})` : ''}
                    {item.logPostedThreadId ? (
                      <span className="ml-2 text-emerald-300">Thread ID: {item.logPostedThreadId}</span>
                    ) : null}
                    {item.logErrorMessage ? (
                      <span className="ml-2 text-rose-300">{item.logErrorMessage}</span>
                    ) : null}
                  </p>
                ) : null}
              </div>
            )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
