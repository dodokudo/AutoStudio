interface QueueItem {
  id: string;
  scheduledTime: string;
  templateId: string;
  theme: string;
  mainText: string;
  comments?: { order: number; text: string }[];
  status: 'draft' | 'approved' | 'scheduled';
}

interface PostQueueProps {
  items: QueueItem[];
}

const statusLabel: Record<QueueItem['status'], string> = {
  draft: '下書き',
  approved: '承認済み',
  scheduled: '予約済み',
};

const statusColor: Record<QueueItem['status'], string> = {
  draft: 'text-amber-300',
  approved: 'text-emerald-400',
  scheduled: 'text-sky-400',
};

export function PostQueue({ items }: PostQueueProps) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">本日の投稿キュー</h2>
        <p className="text-xs text-slate-400">承認後に Threads API で順番に投稿されます</p>
      </header>
      <div className="space-y-4">
        {items.map((item) => (
          <article key={item.id} className="rounded-xl border border-slate-800 bg-slate-900/30 p-5">
            <header className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                {item.scheduledTime}
              </span>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                Template: {item.templateId}
              </span>
              <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                Theme: {item.theme}
              </span>
              <span className={`ml-auto text-xs font-semibold ${statusColor[item.status]}`}>
                {statusLabel[item.status]}
              </span>
            </header>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-100">{item.mainText}</p>
            {item.comments && item.comments.length ? (
              <div className="mt-4 space-y-2 text-sm text-slate-300">
                {item.comments.map((comment) => (
                  <p key={comment.order} className="whitespace-pre-line">
                    <span className="mr-2 rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                      コメント{comment.order}
                    </span>
                    {comment.text}
                  </p>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
