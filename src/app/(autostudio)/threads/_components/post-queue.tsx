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
}

const statusLabel: Record<PlanStatus, string> = {
  draft: '下書き',
  approved: '承認済み',
  scheduled: '予約済み',
  rejected: '差戻し済み',
};

const statusAccent: Record<PlanStatus, string> = {
  draft: 'bg-amber-100 text-amber-600',
  approved: 'bg-emerald-100 text-emerald-600',
  scheduled: 'bg-sky-100 text-sky-600',
  rejected: 'bg-rose-100 text-rose-600',
};

const scheduleOptions = Array.from({ length: 16 }).map((_, index) => {
  const baseMinutes = 6 * 60 + index * 45;
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
}: PostQueueProps) {
  const summary = items.reduce(
    (acc, item) => {
      acc.total += 1;
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    },
    { total: 0, draft: 0, approved: 0, scheduled: 0, rejected: 0 } as Record<PlanStatus | 'total', number>,
  );

  return (
    <section className="card-strong rounded-[32px] p-8 backdrop-blur-xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-indigo-400">今日の承認フロー</p>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">本日の投稿キュー</h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">
            承認後に Threads API がスケジュール順に投稿します。時間を調整し、差戻しがあれば即座に対応しましょう。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-300">
          <span className="rounded-full bg-white/70 px-3 py-1 shadow-sm dark:bg-white/10">計 {summary.total} 件</span>
          <span className="rounded-full bg-emerald-100/70 px-3 py-1 text-emerald-600">承認済 {summary.approved}</span>
          <span className="rounded-full bg-amber-100/70 px-3 py-1 text-amber-600">承認待ち {summary.draft}</span>
          <span className="rounded-full bg-sky-100/70 px-3 py-1 text-sky-600">予約 {summary.scheduled}</span>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-indigo-200/70 bg-white/70 p-12 text-center text-slate-400 dark:border-white/15 dark:bg-white/5">
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-300">まだ今日の投稿案が生成されていません。</p>
          <p className="text-xs text-slate-400">「投稿案を自動生成」からスタートしてください。</p>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {items.map((item) => {
            const templateListId = `template-options-${item.id}`;
            const draft = editableValues[item.id] ?? item;
            const isPending = pendingId === item.id;

            return (
              <article
                key={item.id}
                className="flex h-full flex-col overflow-hidden rounded-3xl bg-white/95 p-6 shadow-[0_24px_60px_rgba(84,110,192,0.18)] transition hover:-translate-y-1 hover:shadow-[0_28px_70px_rgba(82,94,170,0.25)] dark:bg-white/10"
              >
                <div className="grid gap-6 xl:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-600 dark:text-slate-200">
                      <label className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-1.5 text-slate-600 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-indigo-200/80 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Time</span>
                        <select
                          className="bg-transparent text-sm font-medium text-slate-700 outline-none dark:text-white"
                          value={draft.scheduledTime}
                          onChange={(event) => onDraftChange?.(item.id, { scheduledTime: event.target.value })}
                        >
                          {scheduleOptions.map((option) => (
                            <option key={option} value={option} className="text-slate-800">
                              {option}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-1.5 text-slate-600 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-indigo-200/80 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Template</span>
                        <input
                          className="w-32 bg-transparent text-sm font-medium text-slate-700 outline-none dark:text-white"
                          list={templateOptions.length ? templateListId : undefined}
                          value={draft.templateId}
                          onChange={(event) =>
                            onDraftChange?.(item.id, {
                              templateId: event.target.value,
                            })
                          }
                        />
                      </label>
                      {templateOptions.length ? (
                        <datalist id={templateListId}>
                          {templateOptions.map((option) => (
                            <option key={`${item.id}-${option.value}`} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </datalist>
                      ) : null}
                      <label className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-1.5 text-slate-600 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-indigo-200/80 dark:bg-white/10 dark:text-slate-200 dark:ring-white/10">
                        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">Theme</span>
                        <input
                          className="w-36 bg-transparent text-sm font-medium text-slate-700 outline-none dark:text-white"
                          value={draft.theme}
                          onChange={(event) => onDraftChange?.(item.id, { theme: event.target.value })}
                        />
                      </label>
                      <span className={`ml-auto inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${statusAccent[item.status]}`}>
                        <span className="h-2 w-2 rounded-full bg-current opacity-70" />
                        {statusLabel[item.status]}
                      </span>
                    </div>

                    {(onApprove || onReject || onSave || onRerun) && (
                      <div className="flex flex-wrap gap-3 text-xs text-slate-600 dark:text-slate-200">
                        {onRerun ? (
                          <button
                            type="button"
                            onClick={() => onRerun(item.id)}
                            disabled={isPending}
                            className="button-secondary disabled:opacity-50"
                          >
                            {isPending ? '再実行中…' : '再投稿ジョブ作成'}
                          </button>
                        ) : null}
                        {onSave ? (
                          <button
                            type="button"
                            onClick={() =>
                              onSave(item.id, {
                                scheduledTime: draft.scheduledTime,
                                mainText: draft.mainText,
                                templateId: draft.templateId,
                                theme: draft.theme,
                                comments: draft.comments ?? item.comments,
                              })
                            }
                            disabled={isPending}
                            className="button-secondary disabled:opacity-50"
                          >
                            {isPending ? '保存中…' : '変更を保存'}
                          </button>
                        ) : null}
                        {onApprove && item.status !== 'approved' && item.status !== 'scheduled' ? (
                          <button
                            type="button"
                            onClick={() => onApprove(item.id)}
                            disabled={isPending}
                            className="button-primary disabled:opacity-60"
                          >
                            {isPending ? '処理中…' : '承認する'}
                          </button>
                        ) : null}
                        {onReject && item.status !== 'rejected' ? (
                          <button
                            type="button"
                            onClick={() => onReject(item.id)}
                            disabled={isPending}
                            className="rounded-full bg-rose-100 px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-200 disabled:opacity-50 dark:bg-rose-500/20 dark:text-rose-200"
                          >
                            {isPending ? '処理中…' : '差し戻す'}
                          </button>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-4">
                    <textarea
                      className="min-h-[300px] w-full rounded-2xl border border-transparent bg-white/82 p-4 text-sm leading-relaxed text-slate-700 shadow-inner outline-none transition focus:border-indigo-200 focus:ring-2 focus:ring-indigo-200/60 dark:bg-white/10 dark:text-slate-100"
                      rows={10}
                      value={draft.mainText}
                      onChange={(event) => onDraftChange?.(item.id, { mainText: event.target.value })}
                    />

                    <div className="space-y-3 text-sm text-slate-600 dark:text-slate-200">
                      {(draft.comments ?? []).map((comment) => (
                        <div key={comment.order} className="rounded-2xl border border-slate-200/70 bg-white/75 p-3 shadow-sm dark:border-white/10 dark:bg-white/10">
                          <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-300">
                            <span className="inline-flex items-center gap-2 font-semibold">
                              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-indigo-600">コメント{comment.order}</span>
                            </span>
                            <button
                              type="button"
                              className="text-rose-500 hover:text-rose-400"
                              onClick={() => {
                                const next = (draft.comments ?? []).filter((c) => c.order !== comment.order);
                                onCommentChange?.(item.id, next);
                              }}
                            >
                              削除
                            </button>
                          </div>
                          <textarea
                            className="min-h-[180px] w-full rounded-xl border border-transparent bg-white/90 p-3 text-xs text-slate-600 shadow-inner outline-none transition focus:border-indigo-200 focus:ring-1 focus:ring-indigo-200/60 dark:bg-white/10 dark:text-slate-100"
                            rows={6}
                            value={comment.text}
                            onChange={(event) => {
                              const next = (draft.comments ?? []).map((c) =>
                                c.order === comment.order ? { ...c, text: event.target.value } : c,
                              );
                              onCommentChange?.(item.id, next);
                            }}
                          />
                        </div>
                      ))}
                      <button
                        type="button"
                        className="rounded-full border border-dashed border-indigo-200/70 px-4 py-2 text-xs font-semibold text-indigo-600 transition hover:border-indigo-400 hover:bg-indigo-50"
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
                  </div>
                </div>

                {(item.jobStatus || item.logStatus) && (
                  <div className="mt-6 grid gap-2 rounded-2xl bg-slate-50/80 p-4 text-xs text-slate-600 shadow-inner dark:bg-white/5 dark:text-slate-200">
                    {item.jobStatus ? (
                      <p>
                        <span className="font-semibold text-slate-700 dark:text-slate-100">ジョブ状態:</span> {item.jobStatus}
                        {item.jobUpdatedAt ? ` (${new Date(item.jobUpdatedAt).toLocaleString()})` : ''}
                        {item.jobErrorMessage ? (
                          <span className="ml-2 text-rose-500">{item.jobErrorMessage}</span>
                        ) : null}
                      </p>
                    ) : null}
                    {item.logStatus ? (
                      <p>
                        <span className="font-semibold text-slate-700 dark:text-slate-100">最終結果:</span> {item.logStatus}
                        {item.logPostedAt ? ` (${new Date(item.logPostedAt).toLocaleString()})` : ''}
                        {item.logPostedThreadId ? (
                          <span className="ml-2 text-emerald-500">Thread ID: {item.logPostedThreadId}</span>
                        ) : null}
                        {item.logErrorMessage ? (
                          <span className="ml-2 text-rose-500">{item.logErrorMessage}</span>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
