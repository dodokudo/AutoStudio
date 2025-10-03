"use client";

import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

interface RangeOption {
  label: string;
  value: string;
}

interface InsightsRangeSelectorProps {
  options: RangeOption[];
  value: string;
  customStart?: string;
  customEnd?: string;
}

export function InsightsRangeSelector({ options, value, customStart, customEnd }: InsightsRangeSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');

  useEffect(() => {
    setDraftStart(customStart ?? '');
    setDraftEnd(customEnd ?? '');
  }, [customStart, customEnd]);

  const isValidDate = (input: string) => /^\d{4}-\d{2}-\d{2}$/.test(input);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    const nextValue = event.target.value;
    if (nextValue === 'custom') {
      openCustomModal();
      return;
    }
    params.set('range', nextValue);
    params.delete('start');
    params.delete('end');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const openCustomModal = () => {
    const today = new Date();
    const fallbackEnd = customEnd && isValidDate(customEnd) ? customEnd : today.toISOString().slice(0, 10);
    const fallbackStart = customStart && isValidDate(customStart)
      ? customStart
      : new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    setDraftStart(fallbackStart);
    setDraftEnd(fallbackEnd);
    setIsCustomOpen(true);
  };

  const closeCustomModal = () => {
    setIsCustomOpen(false);
  };

  const handleApplyCustom = () => {
    if (!isValidDate(draftStart) || !isValidDate(draftEnd)) return;

    let start = draftStart;
    let end = draftEnd;
    if (draftStart > draftEnd) {
      start = draftEnd;
      end = draftStart;
    }

    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    params.set('range', 'custom');
    params.set('start', start);
    params.set('end', end);
    router.push(`${pathname}?${params.toString()}`);
    setIsCustomOpen(false);
  };

  const selectedLabel = useMemo(() => options.find((option) => option.value === value)?.label ?? '', [options, value]);

  const customSummary = useMemo(() => {
    if (!customStart || !customEnd || !isValidDate(customStart) || !isValidDate(customEnd)) return null;
    return `${customStart} 〜 ${customEnd}`;
  }, [customStart, customEnd]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex items-center gap-2">
        <select
          className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
          value={value}
          onChange={handleChange}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={openCustomModal}
          className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm font-medium text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-surface-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
        >
          カスタム
        </button>
      </div>
      {value === 'custom' && customSummary ? (
        <span className="text-xs text-[color:var(--color-text-secondary)]">{customSummary}</span>
      ) : (
        <span className="text-xs text-[color:var(--color-text-muted)]">{selectedLabel}</span>
      )}

      {isCustomOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">カスタム期間を設定</h3>
            <p className="mt-2 text-xs text-[color:var(--color-text-secondary)]">
              表示したい期間の開始日と終了日を選択してください。
            </p>
            <div className="mt-4 space-y-3">
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-text-secondary)]">
                開始日
                <input
                  type="date"
                  className="h-10 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                  value={draftStart}
                  onChange={(event) => setDraftStart(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-[color:var(--color-text-secondary)]">
                終了日
                <input
                  type="date"
                  className="h-10 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
                  value={draftEnd}
                  onChange={(event) => setDraftEnd(event.target.value)}
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeCustomModal}
                className="h-9 rounded-[var(--radius-sm)] px-4 text-sm font-medium text-[color:var(--color-text-muted)] hover:bg-[color:var(--color-surface-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-border)]"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleApplyCustom}
                disabled={!isValidDate(draftStart) || !isValidDate(draftEnd)}
                className="h-9 rounded-[var(--radius-sm)] bg-[color:var(--color-accent)] px-4 text-sm font-semibold text-white shadow-sm hover:brightness-[0.95] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[color:var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                適用
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
