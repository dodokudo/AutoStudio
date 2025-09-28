"use client";

import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useState } from 'react';
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
  const [startDate, setStartDate] = useState(customStart ?? '');
  const [endDate, setEndDate] = useState(customEnd ?? '');

  useEffect(() => {
    setStartDate(customStart ?? '');
    setEndDate(customEnd ?? '');
  }, [customStart, customEnd]);

  const isValidDate = (input: string) => /^\d{4}-\d{2}-\d{2}$/.test(input);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    params.set('range', event.target.value);
    params.delete('start');
    params.delete('end');
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const handleCustomSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidDate(startDate) || !isValidDate(endDate)) return;
    if (startDate > endDate) return;

    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    params.set('range', 'custom');
    params.set('start', startDate);
    params.set('end', endDate);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
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
      <form onSubmit={handleCustomSubmit} className="flex flex-wrap items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
        <label className="flex items-center gap-1">
          <span className="sr-only">開始日</span>
          <input
            type="date"
            className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <span>〜</span>
        <label className="flex items-center gap-1">
          <span className="sr-only">終了日</span>
          <input
            type="date"
            className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)]"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="h-9 rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-sm font-medium text-[color:var(--color-text-primary)] hover:bg-[color:var(--color-surface-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--color-accent)] disabled:text-[color:var(--color-text-muted)]"
          disabled={!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate}
        >
          適用
        </button>
      </form>
    </div>
  );
}
