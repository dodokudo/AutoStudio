'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { classNames } from '@/lib/classNames';
import type { PromptRow, ThreadsPromptType } from '@/lib/promptSettings';

export interface PromptEditorEntry {
  type: ThreadsPromptType;
  label: string;
  description: string;
  codeLocation: string;
  usedBy: string;
  initialText: string;
  latest: PromptRow | null;
  versions: PromptRow[];
}

interface PromptEditorProps {
  entries: PromptEditorEntry[];
}

interface EditablePromptState {
  text: string;
  savedText: string;
  latest: PromptRow | null;
  versions: PromptRow[];
}

function formatSavedAt(value: string): string {
  if (!value) return '未保存';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ja-JP');
}

export function PromptEditor({ entries }: PromptEditorProps) {
  const [activeType, setActiveType] = useState<ThreadsPromptType>(entries[0]?.type ?? 'ai-tips');
  const [states, setStates] = useState<Record<ThreadsPromptType, EditablePromptState>>(() => {
    const initial = {} as Record<ThreadsPromptType, EditablePromptState>;
    for (const entry of entries) {
      initial[entry.type] = {
        text: entry.initialText,
        savedText: entry.initialText,
        latest: entry.latest,
        versions: entry.versions,
      };
    }
    return initial;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const activeEntry = entries.find((entry) => entry.type === activeType) ?? entries[0];
  const activeState = states[activeType];

  if (!activeEntry || !activeState) return null;

  const updateActiveState = (update: Partial<EditablePromptState>) => {
    setStates((current) => ({
      ...current,
      [activeType]: { ...current[activeType], ...update },
    }));
  };

  const handleSave = async () => {
    const promptText = activeState.text.trim();
    if (!promptText || promptText === activeState.savedText.trim()) return;

    setIsSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/threads/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptType: activeType, promptText }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? '保存に失敗しました');

      const saved = data.saved as PromptRow;
      updateActiveState({
        text: saved.prompt_text,
        savedText: saved.prompt_text,
        latest: saved,
        versions: [saved, ...activeState.versions].slice(0, 10),
      });
      setMessage('保存しました。次回の投稿生成からこの内容が使用されます。');
    } catch (error) {
      setMessage(`保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestore = async (version: number) => {
    if (!window.confirm(`バージョン ${version} を復元しますか？`)) return;

    setIsSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/threads/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptType: activeType, restoreVersion: version }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error ?? '復元に失敗しました');
      if (!data.restored) throw new Error('復元対象が見つかりませんでした');

      const restored = data.restored as PromptRow;
      updateActiveState({
        text: restored.prompt_text,
        savedText: restored.prompt_text,
        latest: restored,
        versions: [restored, ...activeState.versions].slice(0, 10),
      });
      setMessage(`バージョン ${version} の内容を新しいバージョンとして復元しました。`);
    } catch (error) {
      setMessage(`復元に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const hasChanges = activeState.text.trim() !== activeState.savedText.trim();

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-[color:var(--color-border)] px-6 pt-5">
          <div className="flex gap-6 overflow-x-auto" role="tablist" aria-label="プロンプト種別">
            {entries.map((entry) => {
              const isActive = entry.type === activeType;
              return (
                <button
                  key={entry.type}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => {
                    setActiveType(entry.type);
                    setMessage(null);
                  }}
                  className={classNames(
                    'relative shrink-0 px-1 pb-4 text-sm font-medium transition-colors',
                    isActive
                      ? 'text-[color:var(--color-accent)]'
                      : 'text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]',
                  )}
                >
                  {entry.label}
                  {isActive ? (
                    <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-[color:var(--color-accent)]" />
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-5 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">{activeEntry.label}</h2>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  投稿生成で使用中
                </span>
              </div>
              <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">{activeEntry.description}</p>
            </div>
            <div className="text-right text-xs text-[color:var(--color-text-muted)]">
              <p>{activeState.latest ? `バージョン ${activeState.latest.version}` : 'コード既定値'}</p>
              <p className="mt-1">{activeState.latest ? formatSavedAt(activeState.latest.created_at) : 'カスタム保存なし'}</p>
            </div>
          </div>

          <dl className="grid gap-3 rounded-[var(--radius-md)] bg-[color:var(--color-surface-muted)] p-4 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-[color:var(--color-text-muted)]">コード上の既定値</dt>
              <dd className="mt-1 break-all font-medium text-[color:var(--color-text-primary)]">{activeEntry.codeLocation}</dd>
            </div>
            <div>
              <dt className="text-[color:var(--color-text-muted)]">使用箇所</dt>
              <dd className="mt-1 font-medium text-[color:var(--color-text-primary)]">{activeEntry.usedBy}</dd>
            </div>
          </dl>

          <div>
            <label htmlFor={`prompt-${activeType}`} className="text-sm font-medium text-[color:var(--color-text-primary)]">
              プロンプト本文
            </label>
            <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
              保存するとコードを書き換えずに、次回の投稿生成から反映されます。
            </p>
            <textarea
              id={`prompt-${activeType}`}
              className="mt-3 min-h-[560px] w-full resize-y rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 font-mono text-sm leading-6 text-[color:var(--color-text-primary)] outline-none transition focus:border-[color:var(--color-accent)] focus:ring-2 focus:ring-blue-100"
              value={activeState.text}
              onChange={(event) => updateActiveState({ text: event.target.value })}
              spellCheck={false}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleSave} disabled={isSaving || !hasChanges || !activeState.text.trim()}>
              {isSaving ? '保存中…' : '変更を保存'}
            </Button>
            {hasChanges ? (
              <Button variant="secondary" onClick={() => updateActiveState({ text: activeState.savedText })} disabled={isSaving}>
                変更を元に戻す
              </Button>
            ) : null}
            {message ? <p className="text-sm text-[color:var(--color-text-secondary)]">{message}</p> : null}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-[color:var(--color-text-primary)]">変更履歴</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">保存するたびに履歴が残り、以前の内容へ戻せます。</p>
        {activeState.versions.length > 0 ? (
          <ul className="mt-4 divide-y divide-[color:var(--color-border)]">
            {activeState.versions.map((version) => (
              <li key={`${version.prompt_type}-${version.version}`} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-[color:var(--color-text-primary)]">バージョン {version.version}</p>
                  <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">{formatSavedAt(version.created_at)}</p>
                </div>
                <Button variant="secondary" className="h-8 px-3 text-xs" onClick={() => handleRestore(version.version)} disabled={isSaving}>
                  この内容に戻す
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-[var(--radius-md)] bg-[color:var(--color-surface-muted)] px-4 py-6 text-center text-sm text-[color:var(--color-text-muted)]">
            まだ変更履歴はありません。現在はコード上の既定値を使用しています。
          </p>
        )}
      </Card>
    </div>
  );
}
