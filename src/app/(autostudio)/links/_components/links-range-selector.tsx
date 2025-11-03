'use client';

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { DashboardDateRangePicker } from '@/components/dashboard/DashboardDateRangePicker';

interface RangeOption {
  label: string;
  value: string;
}

interface LinksRangeSelectorProps {
  options: RangeOption[];
  value: string;
  customStart?: string;
  customEnd?: string;
  latestLabel?: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function LinksRangeSelector({ options, value, customStart, customEnd, latestLabel }: LinksRangeSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const mappedOptions = useMemo(
    () => options.map((option) => ({ value: option.value, label: option.label })),
    [options],
  );

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

  const normalizeDate = (value: string | null | undefined) => {
    if (!value) return null;
    return DATE_PATTERN.test(value) ? value : null;
  };

  const handleCustomChange = (startValue: string, endValue: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('range', 'custom');

    const normalizedStart = normalizeDate(startValue);
    const normalizedEnd = normalizeDate(endValue);

    if (normalizedStart && normalizedEnd && normalizedStart > normalizedEnd) {
      params.set('start', normalizedEnd);
      params.set('end', normalizedStart);
    } else {
      if (normalizedStart) {
        params.set('start', normalizedStart);
      } else {
        params.delete('start');
      }
      if (normalizedEnd) {
        params.set('end', normalizedEnd);
      } else {
        params.delete('end');
      }
    }

    updateQuery(params);
  };

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
      aria-label="リンクインサイトの期間選択"
    />
  );
}
