import type { CompetitorProfile } from '@/lib/instagram/competitors';

interface Props {
  competitors: CompetitorProfile[];
  addAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
}

export function CompetitorManager({ competitors, addAction, removeAction }: Props) {
  return (
    <section className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-6">
      <h2 className="text-base font-semibold text-white">競合設定</h2>
      <p className="text-xs text-slate-400">
        ここで追加した競合アカウントは、次回のジョブ実行時に Drive フォルダと照合されます。Drive フォルダ ID を指定しない場合は環境変数の既定フォルダが使われます。
      </p>

      <form action={addAction} className="grid gap-3 rounded-md border border-slate-800/70 bg-slate-900/70 p-4 text-sm">
        <div className="grid gap-1">
          <label htmlFor="username" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Instagram ユーザー名（@なし）
          </label>
          <input
            id="username"
            name="username"
            required
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
            placeholder="example_account"
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="driveFolderId" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Drive フォルダID（任意）
          </label>
          <input
            id="driveFolderId"
            name="driveFolderId"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
            placeholder="1abc..."
          />
          <p className="text-xs text-slate-500">未入力の場合は IG_COMPETITOR_DRIVE_FOLDER_ID が利用されます。</p>
        </div>
        <div className="grid gap-1">
          <label htmlFor="category" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            カテゴリ（任意）
          </label>
          <input
            id="category"
            name="category"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
            placeholder="AI / SNS運用 / ..."
          />
        </div>
        <div className="grid gap-1">
          <label htmlFor="priority" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            優先度（数値・小さいほど先に処理）
          </label>
          <input
            id="priority"
            name="priority"
            type="number"
            min="0"
            className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400"
            placeholder="100"
          />
        </div>
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-400"
        >
          競合を追加
        </button>
      </form>

      <div className="space-y-2 text-sm text-slate-200">
        <h3 className="text-sm font-semibold text-slate-200">登録済みの競合</h3>
        {competitors.length > 0 ? (
          <ul className="space-y-2">
            {competitors.map((item) => (
              <li
                key={item.username}
                className="flex flex-col gap-2 rounded-md border border-slate-800/70 bg-slate-900/70 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-semibold text-white">@{item.username}</p>
                  <p className="text-xs text-slate-400">
                    {item.category ? `${item.category} / ` : ''}優先度 {item.priority}
                    {item.driveFolderId ? ` / Drive: ${item.driveFolderId}` : ''}
                  </p>
                </div>
                <form action={removeAction}>
                  <input type="hidden" name="username" value={item.username} />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-md border border-red-500/60 px-3 py-1 text-xs font-semibold text-red-200 hover:bg-red-500/10"
                  >
                    無効化
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500">まだユーザー追加の競合がありません。</p>
        )}
      </div>
    </section>
  );
}

