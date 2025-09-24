'use client';

import { useState } from 'react';

interface PromptEditorProps {
  latest: {
    version: number;
    prompt_text: string;
    created_at: string;
  } | null;
  versions: Array<{
    version: number;
    prompt_text: string;
    created_at: string;
  }>;
}

export function PromptEditor({ latest, versions }: PromptEditorProps) {
  const [promptText, setPromptText] = useState(latest?.prompt_text ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/threads/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptText }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      setMessage('保存しました。Claude生成に即時反映されます。');
    } catch (error) {
      setMessage(`保存に失敗しました: ${(error as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestore = async (version: number) => {
    if (!confirm(`バージョン ${version} を復元しますか？`)) return;
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/threads/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restoreVersion: version }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      const data = await res.json();
      const restored = data?.restored;
      if (restored?.prompt_text) {
        setPromptText(restored.prompt_text);
        setMessage(`バージョン ${version} を復元し、新しいバージョンとして保存しました。`);
      }
    } catch (error) {
      setMessage(`復元に失敗しました: ${(error as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <textarea
        className="h-[500px] w-full rounded-lg border border-slate-700 bg-slate-900/60 p-4 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        value={promptText}
        onChange={(event) => setPromptText(event.target.value)}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-lg bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/30 disabled:opacity-50"
        >
          {isSaving ? '保存中…' : '保存する'}
        </button>
        {message ? <p className="text-xs text-slate-400">{message}</p> : null}
      </div>
      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">履歴</h2>
        <ul className="space-y-2">
          {versions.map((version) => (
            <li
              key={version.version}
              className="flex items-center justify-between rounded border border-slate-800 bg-slate-900/40 px-3 py-2"
            >
              <div className="text-xs text-slate-300">
                <p>
                  バージョン {version.version}{' '}
                  {version.created_at ? `(${new Date(version.created_at).toLocaleString()})` : ''}
                </p>
                <p className="mt-1 line-clamp-2 text-slate-500">
                  {version.prompt_text.slice(0, 120)}
                  {version.prompt_text.length > 120 ? '…' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleRestore(version.version)}
                className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300 transition hover:bg-slate-800"
              >
                復元
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
