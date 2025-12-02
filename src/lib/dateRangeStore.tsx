'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { formatDateInput, resolveDateRange, type UnifiedRangePreset } from '@/lib/dateRangePresets';

export type DatePreset = UnifiedRangePreset;

export interface DateRange {
  start: Date;
  end: Date;
  preset: DatePreset;
}

interface DateRangeContextType {
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;
  updatePreset: (preset: DatePreset, customStart?: Date, customEnd?: Date) => void;
}

const DateRangeContext = createContext<DateRangeContextType | undefined>(undefined);

export const useDateRange = () => {
  const context = useContext(DateRangeContext);
  if (context === undefined) {
    throw new Error('useDateRange must be used within a DateRangeProvider');
  }
  return context;
};

export const DateRangeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const getInitialRange = (): DateRange => {
    const { start, end, preset } = resolveDateRange('7d');
    return { start, end, preset };
  };

  const [dateRange, setDateRange] = useState<DateRange>(getInitialRange);

  const updatePreset = (preset: DatePreset, customStart?: Date, customEnd?: Date) => {
    const customStartStr = customStart ? formatDateInput(customStart) : undefined;
    const customEndStr = customEnd ? formatDateInput(customEnd) : undefined;
    const { start, end } = resolveDateRange(preset, customStartStr, customEndStr);
    setDateRange({
      start,
      end,
      preset
    });
  };

  return (
    <DateRangeContext.Provider value={{
      dateRange,
      setDateRange,
      updatePreset
    }}>
      {children}
    </DateRangeContext.Provider>
  );
};
