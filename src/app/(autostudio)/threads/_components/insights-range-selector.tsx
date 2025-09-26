"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

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
  const [startDate, setStartDate] = useState(customStart ?? "");
  const [endDate, setEndDate] = useState(customEnd ?? "");

  useEffect(() => {
    setStartDate(customStart ?? "");
    setEndDate(customEnd ?? "");
  }, [customStart, customEnd]);

  const isValidDate = (input: string) => /^\d{4}-\d{2}-\d{2}$/.test(input);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams ? searchParams.toString() : "");
    params.set("range", event.target.value);
    params.delete("start");
    params.delete("end");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const handleCustomSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isValidDate(startDate) || !isValidDate(endDate)) return;
    if (startDate > endDate) return;

    const params = new URLSearchParams(searchParams ? searchParams.toString() : "");
    params.set("range", "custom");
    params.set("start", startDate);
    params.set("end", endDate);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <select
        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:border-indigo-200 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-white/10 dark:bg-white/10 dark:text-slate-200"
        value={value}
        onChange={handleChange}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <form onSubmit={handleCustomSubmit} className="flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-300">
        <label className="flex items-center gap-1">
          <span className="sr-only">開始日</span>
          <input
            type="date"
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:border-indigo-200 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-white/10 dark:bg-white/10 dark:text-slate-200"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <span>〜</span>
        <label className="flex items-center gap-1">
          <span className="sr-only">終了日</span>
          <input
            type="date"
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:border-indigo-200 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 dark:border-white/10 dark:bg-white/10 dark:text-slate-200"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-indigo-600 transition hover:border-indigo-300 hover:text-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-50 dark:border-white/10 dark:bg-white/10 dark:text-indigo-200"
          disabled={!isValidDate(startDate) || !isValidDate(endDate) || startDate > endDate}
        >
          適用
        </button>
      </form>
    </div>
  );
}
