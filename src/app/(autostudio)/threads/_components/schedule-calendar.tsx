import { useState } from 'react';
import { classNames } from '@/lib/classNames';
import type { ScheduledPost } from './schedule-types';

const weekdayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  timeZone: 'Asia/Tokyo',
});

const dayLabels = ['日', '月', '火', '水', '木', '金', '土'];

function getJstWeekdayIndex(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month, day, 0, 0, 0));
  const label = weekdayFormatter.format(date);
  return weekdayMap[label] ?? 0;
}

function formatDateKey(year: number, month: number, day: number) {
  const mm = String(month + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function getTimeLabel(value: string) {
  const timePart = value.split('T')[1] ?? '';
  return timePart.slice(0, 5);
}

type ScheduleCalendarProps = {
  currentMonth: Date;
  selectedDate: string;
  items: ScheduledPost[];
  isLoading?: boolean;
  onMonthChange: (next: Date) => void;
  onSelectDate: (dateKey: string) => void;
  onSelectItem: (item: ScheduledPost) => void;
  onDeleteItem: (item: ScheduledPost) => void;
  // AI生成関連
  hookInput: string;
  themeInput: string;
  isGenerating: boolean;
  generateError: string | null;
  onHookInputChange: (value: string) => void;
  onThemeInputChange: (value: string) => void;
  onGenerate: () => void;
};

export function ScheduleCalendar({
  currentMonth,
  selectedDate,
  items,
  isLoading,
  onMonthChange,
  onSelectDate,
  onSelectItem,
  onDeleteItem,
  hookInput,
  themeInput,
  isGenerating,
  generateError,
  onHookInputChange,
  onThemeInputChange,
  onGenerate,
}: ScheduleCalendarProps) {
  const [detailItem, setDetailItem] = useState<ScheduledPost | null>(null);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthLabel = currentMonth.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    timeZone: 'Asia/Tokyo',
  });

  const startOffset = getJstWeekdayIndex(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const countsByDate = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.scheduledDate] = (acc[item.scheduledDate] ?? 0) + 1;
    return acc;
  }, {});

  const selectedItems = items
    .filter((item) => item.scheduledDate === selectedDate)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));

  return (
    <div className="space-y-4">
      {/* AI生成セクション */}
      <section className="ui-card">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-[color:var(--color-text-primary)]">AIで生成</p>
          <button
            type="button"
            className="ui-button-secondary"
            onClick={onGenerate}
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
              onChange={(event) => onHookInputChange(event.target.value)}
              rows={2}
              placeholder="フック（冒頭の一文）を入力。そのまま使用されます"
              className="mt-2 w-full rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
            />
          </label>
          <label className="block text-xs font-medium text-[color:var(--color-text-secondary)]">
            テーマ
            <textarea
              value={themeInput}
              onChange={(event) => onThemeInputChange(event.target.value)}
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
      </section>

      <section className="ui-card">
        <header className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-[color:var(--color-text-primary)]">予約カレンダー</h2>
            <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">{monthLabel} / JST</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="ui-button-secondary px-3 py-1 text-xs"
              onClick={() => onMonthChange(new Date(year, month - 1, 1))}
              type="button"
            >
              前月
            </button>
            <button
              className="ui-button-secondary px-3 py-1 text-xs"
              onClick={() => onMonthChange(new Date(year, month + 1, 1))}
              type="button"
            >
              次月
            </button>
          </div>
        </header>

        <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs text-[color:var(--color-text-muted)]">
          {dayLabels.map((label) => (
            <div key={label} className="font-medium">
              {label}
            </div>
          ))}
        </div>

        <div className="mt-2 grid grid-cols-7 gap-2">
          {Array.from({ length: startOffset }).map((_, index) => (
            <div key={`empty-${index}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, index) => {
            const day = index + 1;
            const dateKey = formatDateKey(year, month, day);
            const count = countsByDate[dateKey] ?? 0;
            const isSelected = selectedDate === dateKey;

            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => onSelectDate(dateKey)}
                className={classNames(
                  'flex flex-col items-center gap-1 rounded-[var(--radius-lg)] border px-2 py-2 text-sm transition',
                  isSelected
                    ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent)]/10 text-[color:var(--color-text-primary)]'
                    : 'border-[color:var(--color-border)] bg-[color:var(--color-surface)] text-[color:var(--color-text-secondary)] hover:border-[color:var(--color-accent)]',
                )}
              >
                <span className="font-semibold">{day}</span>
                <span
                  className={classNames(
                    'text-[10px] font-medium',
                    count > 0
                      ? 'rounded-full bg-[color:var(--color-accent)]/15 px-2 py-0.5 text-[color:var(--color-accent)]'
                      : 'text-[color:var(--color-text-muted)]',
                  )}
                >
                  {count > 0 ? String(count) : '0'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="ui-card">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)]">予約一覧</h3>
            <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">{selectedDate} / JST</p>
          </div>
          {isLoading ? <span className="text-xs text-[color:var(--color-text-muted)]">読み込み中...</span> : null}
        </header>

        {selectedItems.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] px-4 py-6 text-center text-xs text-[color:var(--color-text-muted)]">
            予約がありません
          </div>
        ) : (
          <div className="space-y-3">
            {selectedItems.map((item) => (
              <div
                key={item.scheduleId}
                className="flex flex-col gap-2 rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-3 cursor-pointer hover:bg-[color:var(--color-surface-muted)] transition-colors"
                onDoubleClick={() => setDetailItem(item)}
                title="ダブルクリックで詳細を表示"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-[color:var(--color-text-primary)]">
                    {getTimeLabel(item.scheduledAtJst)}
                    <span
                      className={classNames(
                        'ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium',
                        item.status === 'draft' && 'bg-[#fff4e5] text-[#ad6800]',
                        item.status === 'scheduled' && 'bg-[#e6f4ff] text-[#0a5dc2]',
                        item.status === 'processing' && 'bg-[#f0e6ff] text-[#6b21a8]',
                        item.status === 'posted' && 'bg-[#e6f7ed] text-[#096c3e]',
                        item.status === 'failed' && 'bg-[#fdeded] text-[#a61b1b]',
                      )}
                    >
                      {item.status === 'draft' && '下書き'}
                      {item.status === 'scheduled' && '予約済み'}
                      {item.status === 'processing' && '投稿中'}
                      {item.status === 'posted' && '投稿完了'}
                      {item.status === 'failed' && '失敗'}
                    </span>
                  </div>
                  {(item.status === 'draft' || item.status === 'scheduled' || item.status === 'failed') && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="ui-button-secondary px-3 py-1 text-xs"
                        onClick={() => onSelectItem(item)}
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        className="ui-button-secondary px-3 py-1 text-xs"
                        onClick={() => onDeleteItem(item)}
                      >
                        削除
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-xs text-[color:var(--color-text-secondary)] line-clamp-2">
                  {item.mainText}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 詳細モーダル */}
      {detailItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setDetailItem(null)}
        >
          <div
            className="mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-[var(--radius-lg)] bg-[color:var(--color-surface)] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">
                  投稿内容
                </h3>
                <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">
                  {detailItem.scheduledAtJst.replace('T', ' ').slice(0, 16)} JST
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-2 text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-muted)]"
                onClick={() => setDetailItem(null)}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="mb-2 text-xs font-semibold text-[color:var(--color-text-secondary)]">
                  メイン投稿
                </h4>
                <div className="whitespace-pre-wrap rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3 text-sm text-[color:var(--color-text-primary)]">
                  {detailItem.mainText || '（なし）'}
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold text-[color:var(--color-text-secondary)]">
                  コメント1
                </h4>
                <div className="whitespace-pre-wrap rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3 text-sm text-[color:var(--color-text-primary)]">
                  {detailItem.comment1 || '（なし）'}
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold text-[color:var(--color-text-secondary)]">
                  コメント2
                </h4>
                <div className="whitespace-pre-wrap rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3 text-sm text-[color:var(--color-text-primary)]">
                  {detailItem.comment2 || '（なし）'}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                className="ui-button-secondary"
                onClick={() => setDetailItem(null)}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
