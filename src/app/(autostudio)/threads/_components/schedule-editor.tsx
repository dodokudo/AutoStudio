'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ScheduledPost } from './schedule-types';
import { classNames } from '@/lib/classNames';

const MAX_LENGTH = 500;

function toDateTimeLocal(value: string) {
  if (!value) return '';
  const [datePart, timePart] = value.split('T');
  if (!datePart || !timePart) return '';
  return `${datePart}T${timePart.slice(0, 5)}`;
}

type GeneratedContent = {
  mainText: string;
  comment1: string;
  comment2: string;
};

type ScheduleEditorProps = {
  selectedDate: string;
  selectedItem: ScheduledPost | null;
  isSaving?: boolean;
  isPublishing?: boolean;
  onSave: (payload: {
    scheduleId?: string;
    scheduledAt: string;
    mainText: string;
    comment1: string;
    comment2: string;
    status: 'draft' | 'scheduled';
  }) => Promise<void>;
  onPublishNow: (payload: {
    mainText: string;
    comment1: string;
    comment2: string;
  }) => Promise<void>;
  generatedContent: GeneratedContent | null;
  onGeneratedContentConsumed: () => void;
};

export function ScheduleEditor({
  selectedDate,
  selectedItem,
  isSaving,
  isPublishing,
  onSave,
  onPublishNow,
  generatedContent,
  onGeneratedContentConsumed,
}: ScheduleEditorProps) {
  const [scheduledAt, setScheduledAt] = useState('');
  const [mainText, setMainText] = useState('');
  const [comment1, setComment1] = useState('');
  const [comment2, setComment2] = useState('');
  const [error, setError] = useState<string | null>(null);

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
  }, [selectedDate, selectedItem]);

  // AI生成されたコンテンツを反映
  useEffect(() => {
    if (generatedContent) {
      setMainText(generatedContent.mainText);
      setComment1(generatedContent.comment1);
      setComment2(generatedContent.comment2);
      setError(null);
      onGeneratedContentConsumed();
    }
  }, [generatedContent, onGeneratedContentConsumed]);

  const mainLength = mainText.length;
  const comment1Length = comment1.length;
  const comment2Length = comment2.length;

  const isValidForSchedule = useMemo(() => {
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

  const isValidForPublish = useMemo(() => {
    return (
      mainText.trim().length > 0 &&
      comment1.trim().length > 0 &&
      comment2.trim().length > 0 &&
      mainLength <= MAX_LENGTH &&
      comment1Length <= MAX_LENGTH &&
      comment2Length <= MAX_LENGTH
    );
  }, [mainText, comment1, comment2, mainLength, comment1Length, comment2Length]);

  const handleSubmit = async (status: 'draft' | 'scheduled') => {
    if (!isValidForSchedule) {
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

  const handlePublishNow = async () => {
    if (!isValidForPublish) {
      setError('メイン投稿とコメントを入力してください。');
      return;
    }
    setError(null);
    await onPublishNow({
      mainText,
      comment1,
      comment2,
    });
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
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
            予約日時（JST）
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(event) => setScheduledAt(event.target.value)}
              className="mt-2 w-full rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
            />
          </label>
          <div className="flex flex-col">
            <span className="text-xs font-medium text-[color:var(--color-text-secondary)]">即時投稿</span>
            <button
              type="button"
              className="mt-2 h-[42px] rounded-[var(--radius-lg)] bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              disabled={isPublishing || isSaving}
              onClick={handlePublishNow}
            >
              {isPublishing ? '投稿中...' : '今すぐ投稿'}
            </button>
          </div>
        </div>

        <label className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
          メイン投稿（必須）
          <textarea
            value={mainText}
            onChange={(event) => setMainText(event.target.value)}
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
            onChange={(event) => setComment1(event.target.value)}
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
            onChange={(event) => setComment2(event.target.value)}
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
