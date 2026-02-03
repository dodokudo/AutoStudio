'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ScheduledPost } from './schedule-types';
import { classNames } from '@/lib/classNames';

const MAX_LENGTH = 500;

function clampText(value: string) {
  if (value.length <= MAX_LENGTH) return value;
  return value.slice(0, MAX_LENGTH);
}

function toDateTimeLocal(value: string) {
  if (!value) return '';
  const [datePart, timePart] = value.split('T');
  if (!datePart || !timePart) return '';
  return `${datePart}T${timePart.slice(0, 5)}`;
}

type ScheduleEditorProps = {
  selectedDate: string;
  selectedItem: ScheduledPost | null;
  isSaving?: boolean;
  onSave: (payload: {
    scheduleId?: string;
    scheduledAt: string;
    mainText: string;
    comment1: string;
    comment2: string;
    status: 'draft' | 'scheduled';
  }) => Promise<void>;
};

export function ScheduleEditor({ selectedDate, selectedItem, isSaving, onSave }: ScheduleEditorProps) {
  const [scheduledAt, setScheduledAt] = useState('');
  const [mainText, setMainText] = useState('');
  const [comment1, setComment1] = useState('');
  const [comment2, setComment2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hookInput, setHookInput] = useState('');
  const [themeInput, setThemeInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedItem) {
      setScheduledAt(toDateTimeLocal(selectedItem.scheduledAtJst));
      setMainText(selectedItem.mainText);
      setComment1(selectedItem.comment1);
      setComment2(selectedItem.comment2);
      setError(null);
      return;
    }

    const nextDefault = selectedDate ? `${selectedDate}T09:00` : '';
    setScheduledAt(nextDefault);
    setMainText('');
    setComment1('');
    setComment2('');
    setError(null);
    setGenerateError(null);
  }, [selectedDate, selectedItem]);

  const mainLength = mainText.length;
  const comment1Length = comment1.length;
  const comment2Length = comment2.length;

  const isValid = useMemo(() => {
    return (
      scheduledAt &&
      mainText.trim().length > 0 &&
      comment1.trim().length > 0 &&
      comment2.trim().length > 0 &&
      mainLength <= MAX_LENGTH &&
      comment1Length <= MAX_LENGTH &&
      comment2Length <= MAX_LENGTH
    );
  }, [scheduledAt, mainText, comment1, comment2, mainLength, comment1Length, comment2Length]);

  const handleSubmit = async (status: 'draft' | 'scheduled') => {
    if (!isValid) {
      setError('未入力の項目があります。');
      return;
    }
    setError(null);
    await onSave({
      scheduleId: selectedItem?.scheduleId,
      scheduledAt,
      mainText,
      comment1,
      comment2,
      status,
    });
  };

  const handleGenerate = async () => {
    if (isGenerating) return;
    setGenerateError(null);
    setIsGenerating(true);

    try {
      const res = await fetch('/api/threads/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hook: hookInput.trim() ? hookInput : undefined,
          theme: themeInput.trim() ? themeInput : undefined,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || '生成に失敗しました');
      }

      const data = await res.json();
      if (!data?.mainPost || !data?.comment1 || !data?.comment2) {
        throw new Error('生成結果の形式が正しくありません');
      }

      setMainText(data.mainPost);
      setComment1(data.comment1);
      setComment2(data.comment2);
      setError(null);
    } catch (err) {
      console.error('[schedule-editor] Generate failed', err);
      setGenerateError(err instanceof Error ? err.message : '不明なエラーが発生しました');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <section className="ui-card h-fit">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-[color:var(--color-text-primary)]">予約エディタ</h2>
        <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">
          {selectedItem ? '選択中の予約を編集' : '新規予約を作成'}
        </p>
      </header>

      <div className="space-y-4">
        <label className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
          予約日時（JST）
          <input
            type="datetime-local"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
            className="mt-2 w-full rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
          />
        </label>

        <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-[color:var(--color-text-primary)]">AIで生成</p>
            <button
              type="button"
              className="ui-button-secondary"
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? '生成中...' : 'AIで生成'}
            </button>
          </div>
          <div className="mt-3 space-y-3">
            <label className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
              フック
              <textarea
                value={hookInput}
                onChange={(event) => setHookInput(event.target.value)}
                rows={2}
                placeholder="フック（冒頭の一文）を入力。そのまま使用されます"
                className="mt-2 w-full rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
              />
            </label>
            <label className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
              テーマ
              <textarea
                value={themeInput}
                onChange={(event) => setThemeInput(event.target.value)}
                rows={2}
                placeholder="テーマを入力（例：Threads運用のコツ）"
                className="mt-2 w-full rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
              />
            </label>
            {generateError ? (
              <div className="rounded-[var(--radius-lg)] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {generateError}
              </div>
            ) : null}
          </div>
        </div>

        <label className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
          メイン投稿（必須）
          <textarea
            value={mainText}
            onChange={(event) => setMainText(clampText(event.target.value))}
            rows={4}
            className="mt-2 w-full rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
          />
          <div className={classNames('mt-1 text-right text-[11px]', mainLength > MAX_LENGTH ? 'text-red-500' : 'text-[color:var(--color-text-muted)]')}>
            {mainLength}/{MAX_LENGTH}
          </div>
        </label>

        <label className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
          コメント1（必須）
          <textarea
            value={comment1}
            onChange={(event) => setComment1(clampText(event.target.value))}
            rows={9}
            className="mt-2 w-full rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
          />
          <div className={classNames('mt-1 text-right text-[11px]', comment1Length > MAX_LENGTH ? 'text-red-500' : 'text-[color:var(--color-text-muted)]')}>
            {comment1Length}/{MAX_LENGTH}
          </div>
        </label>

        <label className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
          コメント2（必須）
          <textarea
            value={comment2}
            onChange={(event) => setComment2(clampText(event.target.value))}
            rows={9}
            className="mt-2 w-full rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
          />
          <div className={classNames('mt-1 text-right text-[11px]', comment2Length > MAX_LENGTH ? 'text-red-500' : 'text-[color:var(--color-text-muted)]')}>
            {comment2Length}/{MAX_LENGTH}
          </div>
        </label>

        {error ? (
          <div className="rounded-[var(--radius-lg)] border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="ui-button-secondary"
            disabled={isSaving}
            onClick={() => handleSubmit('draft')}
          >
            {isSaving ? '保存中...' : '下書き保存'}
          </button>
          <button
            type="button"
            className="ui-button-primary"
            disabled={isSaving}
            onClick={() => handleSubmit('scheduled')}
          >
            {isSaving ? '登録中...' : '予約登録'}
          </button>
        </div>
      </div>
    </section>
  );
}
