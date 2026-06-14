'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ScheduledPost, ScheduledPostMediaItem } from './schedule-types';
import { classNames } from '@/lib/classNames';
import type { ThreadsAccountKey } from '@/lib/threadsAccounts';

const MAX_LENGTH = 500;
const MAX_MEDIA_ITEMS = 10;
const MAX_COMMENT_MEDIA_ITEMS = 2;

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
  accountKey: ThreadsAccountKey;
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
    comment8: string;
    mediaItems: ScheduledPostMediaItem[];
    comment1MediaItems: ScheduledPostMediaItem[];
    comment2MediaItems: ScheduledPostMediaItem[];
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
    comment8: string;
    mediaItems: ScheduledPostMediaItem[];
    comment1MediaItems: ScheduledPostMediaItem[];
    comment2MediaItems: ScheduledPostMediaItem[];
  }) => Promise<void>;
  generatedContent: GeneratedContent | null;
  onGeneratedContentConsumed: () => void;
  accountLabel: string;
  isReadOnly?: boolean;
};

export function ScheduleEditor({
  selectedDate,
  selectedItem,
  accountKey,
  isSaving,
  isPublishing,
  onSave,
  onPublishNow,
  generatedContent,
  onGeneratedContentConsumed,
  accountLabel,
  isReadOnly = false,
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
  const [comment8, setComment8] = useState('');
  const [mediaItems, setMediaItems] = useState<ScheduledPostMediaItem[]>([]);
  const [comment1MediaItems, setComment1MediaItems] = useState<ScheduledPostMediaItem[]>([]);
  const [comment2MediaItems, setComment2MediaItems] = useState<ScheduledPostMediaItem[]>([]);
  const [uploadingMedia, setUploadingMedia] = useState(false);
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
      setComment8(selectedItem.comment8);
      setMediaItems(selectedItem.mediaItems || []);
      setComment1MediaItems(selectedItem.comment1MediaItems || []);
      setComment2MediaItems(selectedItem.comment2MediaItems || []);
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
    setComment8('');
    setMediaItems([]);
    setComment1MediaItems([]);
    setComment2MediaItems([]);
    setError(null);
  }, [selectedDate, selectedItem]);

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
  const comment8Length = comment8.length;

  const optionalCommentsValid =
    comment1Length <= MAX_LENGTH &&
    comment2Length <= MAX_LENGTH &&
    comment3Length <= MAX_LENGTH &&
    comment4Length <= MAX_LENGTH &&
    comment5Length <= MAX_LENGTH &&
    comment6Length <= MAX_LENGTH &&
    comment7Length <= MAX_LENGTH &&
    comment8Length <= MAX_LENGTH;

  const isValidForSchedule = useMemo(() => {
    return (
      scheduledAt &&
      mainText.trim().length > 0 &&
      mainLength <= MAX_LENGTH &&
      optionalCommentsValid
    );
  }, [scheduledAt, mainText, mainLength, optionalCommentsValid]);

  const isValidForPublish = useMemo(() => {
    return mainText.trim().length > 0 && mainLength <= MAX_LENGTH && optionalCommentsValid;
  }, [mainText, mainLength, optionalCommentsValid]);

  const handleMediaUpload = async (
    files: FileList | null,
    currentItems: ScheduledPostMediaItem[],
    setItems: Dispatch<SetStateAction<ScheduledPostMediaItem[]>>,
    maxItems: number,
    uploadScope: string,
  ) => {
    if (!files || files.length === 0) return;
    const nextFiles = Array.from(files);
    if (currentItems.length + nextFiles.length > maxItems) {
      setError(`メディアは最大${maxItems}件までです。`);
      return;
    }

    setUploadingMedia(true);
    setError(null);
    try {
      const uploadGroup = `${selectedItem?.scheduleId || Date.now()}-${uploadScope}`;
      const res = await fetch('/api/threads/schedule/media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountKey,
          uploadGroup,
          files: nextFiles.map((file) => ({ name: file.name, type: file.type, size: file.size })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'メディアのアップロードに失敗しました');
      }

      const uploadTargets = Array.isArray(data.uploadTargets) ? data.uploadTargets : [];
      if (uploadTargets.length !== nextFiles.length) {
        throw new Error('アップロードURLの作成に失敗しました');
      }

      const uploaded: ScheduledPostMediaItem[] = [];
      for (let index = 0; index < nextFiles.length; index += 1) {
        const file = nextFiles[index];
        const target = uploadTargets[index];
        const uploadRes = await fetch(target.uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': target.contentType || file.type },
          body: file,
        });
        if (!uploadRes.ok) {
          throw new Error(`${file.name}のアップロードに失敗しました`);
        }
        uploaded.push({
          url: target.url,
          type: target.type === 'VIDEO' ? 'VIDEO' : 'IMAGE',
          name: target.name || file.name,
        });
      }

      setItems((current) => [...current, ...uploaded].slice(0, maxItems));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'メディアのアップロードに失敗しました');
    } finally {
      setUploadingMedia(false);
    }
  };

  const removeMediaItem = (
    index: number,
    setItems: Dispatch<SetStateAction<ScheduledPostMediaItem[]>>,
  ) => {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleSubmit = async (status: 'draft' | 'scheduled') => {
    if (!isValidForSchedule) {
      setError('未入力または文字数超過の項目があります。');
      return;
    }
    if (isReadOnly) {
      setError('合算表示では予約を作成できません。本垢またはサブ垢を選んでください。');
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
      comment8,
      mediaItems,
      comment1MediaItems,
      comment2MediaItems,
      status,
    });
  };

  const handlePublishNow = async () => {
    if (!isValidForPublish) {
      setError('メイン投稿を入力してください。');
      return;
    }
    if (isReadOnly) {
      setError('合算表示では即時投稿できません。本垢またはサブ垢を選んでください。');
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
      comment8,
      mediaItems,
      comment1MediaItems,
      comment2MediaItems,
    });
  };

  const renderMediaPicker = (
    label: string,
    items: ScheduledPostMediaItem[],
    setItems: Dispatch<SetStateAction<ScheduledPostMediaItem[]>>,
    maxItems: number,
    uploadScope: string,
    hint: string,
  ) => (
    <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium text-[color:var(--color-text-secondary)]">{label}</div>
          <div className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">{hint}</div>
        </div>
        <label className="cursor-pointer rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-xs font-medium text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-surface-hover)]">
          {uploadingMedia ? 'アップロード中...' : '追加'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
            multiple
            disabled={uploadingMedia || items.length >= maxItems}
            className="hidden"
            onChange={(event) => {
              void handleMediaUpload(event.target.files, items, setItems, maxItems, uploadScope);
              event.target.value = '';
            }}
          />
        </label>
      </div>

      {items.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {items.map((item, index) => (
            <div key={`${item.url}-${index}`} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-2">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-[color:var(--color-surface-muted)] text-[10px] font-semibold text-[color:var(--color-text-muted)]">
                {item.type === 'IMAGE' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  'VIDEO'
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium text-[color:var(--color-text-primary)]">
                  {item.name || `${item.type} ${index + 1}`}
                </div>
                <div className="text-[11px] text-[color:var(--color-text-muted)]">{item.type}</div>
              </div>
              <button
                type="button"
                className="rounded-[var(--radius-sm)] px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                onClick={() => removeMediaItem(index, setItems)}
              >
                削除
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <section className="ui-card h-fit min-w-0">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-[color:var(--color-text-primary)]">予約エディタ</h2>
        <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">
          {selectedItem ? '選択中の予約を編集' : '新規予約を作成'} / 投稿先: {accountLabel}
        </p>
      </header>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
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
              disabled={isPublishing || isSaving || isReadOnly || uploadingMedia}
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

        {renderMediaPicker('画像 / 動画', mediaItems, setMediaItems, MAX_MEDIA_ITEMS, 'main', `最大${MAX_MEDIA_ITEMS}件、投稿本文に添付`)}

        <label className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
          コメント1（任意）
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

        {renderMediaPicker('コメント1の画像 / 動画', comment1MediaItems, setComment1MediaItems, MAX_COMMENT_MEDIA_ITEMS, 'comment1', `最大${MAX_COMMENT_MEDIA_ITEMS}件、コメント1に添付`)}

        <label className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
          コメント2（任意）
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

        {renderMediaPicker('コメント2の画像 / 動画', comment2MediaItems, setComment2MediaItems, MAX_COMMENT_MEDIA_ITEMS, 'comment2', `最大${MAX_COMMENT_MEDIA_ITEMS}件、コメント2に添付`)}

        {([
          { index: 3, value: comment3, length: comment3Length, setter: setComment3 },
          { index: 4, value: comment4, length: comment4Length, setter: setComment4 },
          { index: 5, value: comment5, length: comment5Length, setter: setComment5 },
          { index: 6, value: comment6, length: comment6Length, setter: setComment6 },
          { index: 7, value: comment7, length: comment7Length, setter: setComment7 },
          { index: 8, value: comment8, length: comment8Length, setter: setComment8 },
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

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            className="ui-button-secondary justify-center"
            disabled={isSaving || isReadOnly || uploadingMedia}
            onClick={() => handleSubmit('draft')}
          >
            {isSaving ? '保存中...' : '下書き保存'}
          </button>
          <button
            type="button"
            className="ui-button-primary justify-center"
            disabled={isSaving || isReadOnly || uploadingMedia}
            onClick={() => handleSubmit('scheduled')}
          >
            {isSaving ? '登録中...' : '予約登録'}
          </button>
        </div>
      </div>
    </section>
  );
}
