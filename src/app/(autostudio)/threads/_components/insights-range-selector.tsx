"use client";

import type { ChangeEvent } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

interface RangeOption {
  label: string;
  value: string;
}

interface InsightsRangeSelectorProps {
  options: RangeOption[];
  value: string;
}

export function InsightsRangeSelector({ options, value }: InsightsRangeSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams ? searchParams.toString() : "");
    params.set("range", event.target.value);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  return (
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
  );
}
