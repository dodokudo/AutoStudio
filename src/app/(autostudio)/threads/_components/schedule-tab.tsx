'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScheduleCalendar } from './schedule-calendar';
import { ScheduleEditor } from './schedule-editor';
import type { ScheduledPost } from './schedule-types';

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMonthStart(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function formatMonthEnd(date: Date) {
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return formatDateKey(lastDay);
}

function monthKey(value: string) {
  return value.slice(0, 7);
}

function mapItem(raw: Record<string, unknown>): ScheduledPost {
  return {
    scheduleId: String(raw.schedule_id ?? ''),
    planId: raw.plan_id ? String(raw.plan_id) : null,
    scheduledAt: String(raw.scheduled_time ?? ''),
    scheduledAtJst: String(raw.scheduled_at_jst ?? ''),
    scheduledDate: String(raw.scheduled_date ?? ''),
    status: String(raw.status ?? 'scheduled'),
    mainText: String(raw.main_text ?? ''),
    comment1: String(raw.comment1 ?? ''),
    comment2: String(raw.comment2 ?? ''),
    createdAt: String(raw.created_at ?? ''),
    updatedAt: String(raw.updated_at ?? ''),
    templateId: raw.template_id ? String(raw.template_id) : null,
    theme: raw.theme ? String(raw.theme) : null,
    planStatus: raw.plan_status ? String(raw.plan_status) : null,
  };
}

function getJstNow() {
  const now = new Date();
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
}

export function ScheduleTab() {
  const [currentMonth, setCurrentMonth] = useState(() => getJstNow());
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(getJstNow()));
  const [items, setItems] = useState<ScheduledPost[]>([]);
  const [selectedItem, setSelectedItem] = useState<ScheduledPost | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => ({
    start: formatMonthStart(currentMonth),
    end: formatMonthEnd(currentMonth),
  }), [currentMonth]);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ start: range.start, end: range.end });
      const res = await fetch(`/api/threads/schedule?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to load schedules');
      }
      const mapped = Array.isArray(data.items) ? data.items.map(mapItem) : [];
      setItems(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [range.end, range.start]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const handleMonthChange = (next: Date) => {
    setCurrentMonth(next);
    const nextDateKey = formatDateKey(next);
    setSelectedDate(nextDateKey);
  };

  const handleSelectDate = (dateKey: string) => {
    setSelectedDate(dateKey);
    setSelectedItem(null);
  };

  const handleSelectItem = (item: ScheduledPost) => {
    setSelectedItem(item);
  };

  const handleDeleteItem = async (item: ScheduledPost) => {
    if (!confirm('この予約を削除しますか？')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/threads/schedule/${item.scheduleId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to delete schedule');
      }
      if (selectedItem?.scheduleId === item.scheduleId) {
        setSelectedItem(null);
      }
      await loadSchedules();
    } catch (err) {
      alert(err instanceof Error ? err.message : '削除に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (payload: {
    scheduleId?: string;
    scheduledAt: string;
    mainText: string;
    comment1: string;
    comment2: string;
    status: 'draft' | 'scheduled';
  }) => {
    setSaving(true);
    try {
      const hasId = Boolean(payload.scheduleId);
      const res = await fetch(
        hasId ? `/api/threads/schedule/${payload.scheduleId}` : '/api/threads/schedule',
        {
          method: hasId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scheduledAt: payload.scheduledAt,
            mainText: payload.mainText,
            comment1: payload.comment1,
            comment2: payload.comment2,
            status: payload.status,
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to save schedule');
      }
      const savedItem = data.item ? mapItem(data.item) : null;
      if (savedItem) {
        setSelectedItem(savedItem);
        if (savedItem.scheduledDate) {
          setSelectedDate(savedItem.scheduledDate);
          if (monthKey(savedItem.scheduledDate) !== monthKey(formatDateKey(currentMonth))) {
            const [year, month] = savedItem.scheduledDate.split('-').map((part) => Number(part));
            if (year && month) {
              setCurrentMonth(new Date(year, month - 1, 1));
            }
          }
        }
      }
      await loadSchedules();
    } catch (err) {
      alert(err instanceof Error ? err.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {error ? (
        <div className="ui-card">
          <div className="ui-banner ui-banner-error">{error}</div>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <ScheduleCalendar
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          items={items}
          isLoading={loading}
          onMonthChange={handleMonthChange}
          onSelectDate={handleSelectDate}
          onSelectItem={handleSelectItem}
          onDeleteItem={handleDeleteItem}
        />
        <ScheduleEditor
          selectedDate={selectedDate}
          selectedItem={selectedItem}
          isSaving={saving}
          onSave={handleSave}
        />
      </div>
    </div>
  );
}
