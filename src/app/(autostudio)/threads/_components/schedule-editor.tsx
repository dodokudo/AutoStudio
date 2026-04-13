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
    comment3: string;
    comment4: string;
    comment5: string;
    comment6: string;
    comment7: string;
    status: 'draft' | 'scheduled';
  }) => Promise<void>;
  onPublishNow: (payload: {
    mainText: string;
    comment1: string;
    comment2: string;
    comment3: string;
    comment4: string;
    comment5: string;
    comment6: string;
    comment7: string;
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
  const [comment3, setComment3] = useState('');
  const [comment4, setComment4] = useState('');
  const [comment5, setComment5] = useState('');
  const [comment6, setComment6] = useState('');
  const [comment7, setComment7] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedItem) {
      setScheduledAt(toDateTimeLocal(selectedItem.scheduledAtJst));
      setMainText(selectedItem.mainText);
      setComment1(selectedItem.comment1);
      setComment2(selectedItem.comment2);
      setComment3(selectedItem.comment3);
      setComment4(selectedItem.comment4);
      setComment5(selectedItem.comment5);
      setComment6(selectedItem.comment6);
      setComment7(selectedItem.comment7);
      setError(null);
      return;
    }

    const nextDefault = selectedDate ? `${selectedDate}T09:00` : '';
    setScheduledAt(nextDefault);
    setMainText('');
    setComment1('');
    setComment2('');
    setComment3('');
    setComment4('');
    setComment5('');
    setComment6('');
    setComment7('');
    setError(null);
  }, [selectedDate, selectedItem]);

  // AI生成されたコンテンツを反映（comment1, comment2のみ。3〜7は手動入力）
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
  const comment3Length = comment3.length;
  const comment4Length = comment4.length;
  const comment5Length = comment5.length;
  const comment6Length = comment6.length;
  const comment7Length = comment7.length;

  const optionalCommentsValid =
    comment3Length <= MAX_LENGTH &&
    comment4Length <= MAX_LENGTH &&
    comment5Length <= MAX_LENGTH &&
    comment6Length <= MAX_LENGTH &&
    comment7Length <= MAX_LENGTH;

  const isValidForSchedule = useMemo(() => {
    return (
      scheduledAt &&
      mainText.trim().length > 0 &&
      comment1.trim().length > 0 &&
      comment2.trim().length > 0 &&
      mainLength <= MAX_LENGTH &&
      comment1Length <= MAX_LENGTH &&
      comment2Length <= MAX_LENGTH &&
      optionalCommentsValid
    );
  }, [scheduledAt, mainText, comment1, comment2, mainLength, comment1Length, comment2Length, optionalCommentsValid]);

  const isValidForPublish = useMemo(() => {
    return (
      mainText.trim().length > 0 &&
      comment1.trim().length > 0 &&
      comment2.trim().length > 0 &&
      mainLength <= MAX_LENGTH &&
      comment1Length <= MAX_LENGTH &&
      comment2Length <= MAX_LENGTH &&
      optionalCommentsValid
    );
  }, [mainText, comment1, comment2, mainLength, comment1Length, comment2Length, optionalCommentsValid]);

  const handleSubmit = async (status: 'draft' | 'scheduled') => {
    if (!isValidForSchedule) {
      setError('未入力または文字数超過の項目があります。');
      return;
    }
    setError(null);
    await onSave({
      scheduleId: selectedItem?.scheduleId,
      scheduledAt,
      mainText,
      comment1,
      comment2,
      comment3,
      comment4,
      comment5,
      comment6,
      comment7,
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
      comment3,
      comment4,
      comment5,
      comment6,
      comment7,
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

        {([
          { index: 3, value: comment3, length: comment3Length, setter: setComment3 },
          { index: 4, value: comment4, length: comment4Length, setter: setComment4 },
          { index: 5, value: comment5, length: comment5Length, setter: setComment5 },
          { index: 6, value: comment6, length: comment6Length, setter: setComment6 },
          { index: 7, value: comment7, length: comment7Length, setter: setComment7 },
        ] as const).map((c) => (
          <label key={c.index} className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
            コメント{c.index}（任意）
            <textarea
              value={c.value}
              onChange={(event) => c.setter(event.target.value)}
              rows={9}
              className="mt-2 w-full rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
            />
            <div className={classNames('mt-1 text-right text-[11px]', c.length > MAX_LENGTH ? 'text-red-500' : 'text-[color:var(--color-text-muted)]')}>
              {c.length}/{MAX_LENGTH}
            </div>
          </label>
        ))}

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
