'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

export type DatePreset = 'yesterday' | 'this-week' | 'last-week' | 'this-month' | 'last-month' | 'custom';

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

// 現在の週の開始と終了を取得する関数（月曜日から日曜日）
const getThisWeekRange = () => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 日曜日は6、月曜日は0

  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { start: monday, end: sunday };
};

// 先週の開始と終了を取得する関数
const getLastWeekRange = () => {
  const thisWeek = getThisWeekRange();
  const lastWeekStart = new Date(thisWeek.start);
  lastWeekStart.setDate(thisWeek.start.getDate() - 7);

  const lastWeekEnd = new Date(thisWeek.end);
  lastWeekEnd.setDate(thisWeek.end.getDate() - 7);

  return { start: lastWeekStart, end: lastWeekEnd };
};

const getYesterdayRange = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

// 今月の開始と終了を取得する関数
const getThisMonthRange = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(today);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

// 先月の開始と終了を取得する関数
const getLastMonthRange = () => {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  start.setHours(0, 0, 0, 0);

  const end = new Date(today.getFullYear(), today.getMonth(), 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

// プリセットから日付範囲を取得する関数
const getDateRangeFromPreset = (preset: DatePreset, customStart?: Date, customEnd?: Date): { start: Date; end: Date } => {
  switch (preset) {
    case 'yesterday':
      return getYesterdayRange();
    case 'this-week':
      return getThisWeekRange();
    case 'last-week':
      return getLastWeekRange();
    case 'this-month':
      return getThisMonthRange();
    case 'last-month':
      return getLastMonthRange();
    case 'custom':
      if (customStart && customEnd) {
        const start = new Date(customStart);
        start.setHours(0, 0, 0, 0);
        const end = new Date(customEnd);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      }
      // フォールバック: 今週を返す
      return getThisWeekRange();
    default:
      return getThisWeekRange();
  }
};

export const DateRangeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const getInitialRange = (): DateRange => {
    const yesterdayRange = getYesterdayRange();

    return {
      start: yesterdayRange.start,
      end: yesterdayRange.end,
      preset: 'yesterday'
    };
  };

  const [dateRange, setDateRange] = useState<DateRange>(getInitialRange);

  const updatePreset = (preset: DatePreset, customStart?: Date, customEnd?: Date) => {
    const range = getDateRangeFromPreset(preset, customStart, customEnd);
    setDateRange({
      start: range.start,
      end: range.end,
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
