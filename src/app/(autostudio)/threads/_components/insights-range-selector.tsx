"use client";

import { useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { DashboardDateRangePicker } from '@/components/dashboard/DashboardDateRangePicker';

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

const isValidDate = (input: string) => /^\d{4}-\d{2}-\d{2}$/.test(input);

export function InsightsRangeSelector({ options, value, customStart, customEnd }: InsightsRangeSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const mappedOptions = useMemo(() => options.map((option) => ({ value: option.value, label: option.label })), [options]);

  const updateQuery = (params: URLSearchParams) => {
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  };

  const handleChange = (nextValue: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', nextValue);
    if (nextValue !== 'custom') {
      params.delete('start');
      params.delete('end');
    }
    updateQuery(params);
  };

  const handleCustomChange = (start: string, end: string) => {
    if (!isValidDate(start) || !isValidDate(end)) return;

    let normalizedStart = start;
    let normalizedEnd = end;
    if (start && end && start > end) {
      normalizedStart = end;
      normalizedEnd = start;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set('range', 'custom');
    params.set('start', normalizedStart);
    params.set('end', normalizedEnd);
    updateQuery(params);
  };

  const latestLabel = useMemo(() => {
    if (value === 'custom' && customEnd && isValidDate(customEnd)) {
      return `${customStart ?? ''} 〜 ${customEnd}`.trim();
    }
    return undefined;
  }, [value, customStart, customEnd]);

  return (
    <DashboardDateRangePicker
      options={mappedOptions}
      value={value}
      onChange={handleChange}
      allowCustom
      customStart={customStart}
      customEnd={customEnd}
      onCustomChange={handleCustomChange}
      latestLabel={latestLabel}
    />
  );
}
