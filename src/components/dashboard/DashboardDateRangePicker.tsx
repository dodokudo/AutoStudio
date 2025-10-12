'use client';

import { useMemo } from 'react';

interface DashboardDateRangePickerProps {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  allowCustom?: boolean;
  customStart?: string;
  customEnd?: string;
  onCustomChange?: (start: string, end: string) => void;
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
              value={customStart ?? ''}
              onChange={(event) => onCustomChange?.(event.target.value, customEnd ?? '')}
              className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-[color:var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
            />
          </label>
          <label className="flex items-center gap-1">
            <span>終了</span>
            <input
              type="date"
              value={customEnd ?? ''}
              onChange={(event) => onCustomChange?.(customStart ?? '', event.target.value)}
              className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1 text-[color:var(--color-text-primary)] focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
