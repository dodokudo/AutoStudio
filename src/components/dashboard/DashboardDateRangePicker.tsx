'use client';

import { useEffect, useMemo, useState } from 'react';

interface DashboardDateRangePickerProps {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  allowCustom?: boolean;
  customStart?: string;
  customEnd?: string;
  onCustomChange?: (start: string, end: string) => void;
  customApplyMode?: boolean;
  customApplyLabel?: string;
  latestLabel?: string;
  className?: string;
  'aria-label'?: string;
}

export function DashboardDateRangePicker({
  options,
  value,
  onChange,
  allowCustom = true,
  customStart,
  customEnd,
  onCustomChange,
  customApplyMode = false,
  customApplyLabel = '適用',
  latestLabel,
  className,
  'aria-label': ariaLabel,
}: DashboardDateRangePickerProps) {
  const hasCustom = useMemo(() => options.some((option) => option.value === 'custom'), [options]);
  const resolvedOptions = useMemo(() => {
    if (allowCustom) return options;
    return options.filter((option) => option.value !== 'custom');
  }, [allowCustom, options]);

  const showCustomInputs = allowCustom && value === 'custom' && hasCustom;
  const [draftCustomStart, setDraftCustomStart] = useState(customStart ?? '');
  const [draftCustomEnd, setDraftCustomEnd] = useState(customEnd ?? '');

  useEffect(() => {
    setDraftCustomStart(customStart ?? '');
  }, [customStart]);

  useEffect(() => {
    setDraftCustomEnd(customEnd ?? '');
  }, [customEnd]);

  const effectiveCustomStart = customApplyMode ? draftCustomStart : (customStart ?? '');
  const effectiveCustomEnd = customApplyMode ? draftCustomEnd : (customEnd ?? '');
  const isCustomDraftValid = effectiveCustomStart !== '' && effectiveCustomEnd !== '';
  const hasDraftChanged = effectiveCustomStart !== (customStart ?? '') || effectiveCustomEnd !== (customEnd ?? '');

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3 text-sm text-[color:var(--color-text-secondary)]">
        <label className="inline-flex items-center gap-2">
          <span className="sr-only">{ariaLabel ?? '期間選択'}</span>
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="h-9 min-w-[140px] rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm text-[color:var(--color-text-primary)] shadow-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
          >
            {resolvedOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {latestLabel ? <span className="text-xs text-[color:var(--color-text-muted)]">{latestLabel}</span> : null}
      </div>

      {showCustomInputs ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-text-secondary)]">
          <label className="flex items-center gap-1">
            <span>開始</span>
            <input
              type="date"
              value={effectiveCustomStart}
              onChange={(event) => {
                const nextValue = event.target.value;
                if (customApplyMode) {
                  setDraftCustomStart(nextValue);
                  return;
                }
                onCustomChange?.(nextValue, customEnd ?? '');
              }}
              className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-[color:var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
            />
          </label>
          <label className="flex items-center gap-1">
            <span>終了</span>
            <input
              type="date"
              value={effectiveCustomEnd}
              onChange={(event) => {
                const nextValue = event.target.value;
                if (customApplyMode) {
                  setDraftCustomEnd(nextValue);
                  return;
                }
                onCustomChange?.(customStart ?? '', nextValue);
              }}
              className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-[color:var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
            />
          </label>
          {customApplyMode ? (
            <button
              type="button"
              onClick={() => onCustomChange?.(draftCustomStart, draftCustomEnd)}
              disabled={!isCustomDraftValid || !hasDraftChanged}
              className="rounded-[var(--radius-sm)] border border-[color:var(--color-accent)] bg-[color:var(--color-accent)] px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {customApplyLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
