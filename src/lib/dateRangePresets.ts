/**
 * 統一された期間プリセットと計算ロジック。
 * すべてのダッシュボードで同じ値/ラベルと開始・終了日の算出を使う。
 */
export type UnifiedRangePreset =
  | '1d'
  | '3d'
  | 'this-week'
  | '7d'
  | 'last-week'
  | 'this-month'
  | '30d'
  | 'last-month'
  | '90d'
  | 'all'
  | 'custom';

export const UNIFIED_RANGE_OPTIONS: Array<{ value: UnifiedRangePreset; label: string }> = [
  { value: '1d', label: '昨日' },
  { value: '3d', label: '過去3日' },
  { value: 'this-week', label: '今週' },
  { value: '7d', label: '過去7日' },
  { value: 'last-week', label: '先週' },
  { value: 'this-month', label: '今月' },
  { value: '30d', label: '過去30日' },
  { value: 'last-month', label: '先月' },
  { value: '90d', label: '過去90日' },
  { value: 'all', label: '全期間' },
  { value: 'custom', label: 'カスタム' },
];

const DEFAULT_PRESET: UnifiedRangePreset = '7d';

/**
 * サーバー(UTC)・クライアント(JST)どちらで実行されても
 * 日本時間の「今日」を返す。
 */
function getJstToday(): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = formatter.format(new Date()).split('-').map(Number);
  return new Date(year, month - 1, day);
}

const toStartOfDay = (date: Date) => {
  const atLocalStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  atLocalStart.setHours(0, 0, 0, 0);
  return atLocalStart;
};

const toEndOfDay = (date: Date) => {
  const atLocalEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return atLocalEnd;
};

const parseDateInput = (value?: string | null): Date | null => {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) return null;
  const [year, month, day] = value.split('-').map((part) => Number(part));
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
};

export function isUnifiedRangePreset(value: string | undefined | null): value is UnifiedRangePreset {
  return UNIFIED_RANGE_OPTIONS.some((option) => option.value === value);
}

export function resolveDateRange(
  preset: UnifiedRangePreset,
  customStart?: string | null,
  customEnd?: string | null,
  options?: { includeToday?: boolean },
): { start: Date; end: Date; preset: UnifiedRangePreset } {
  const today = getJstToday();
  const includeToday = options?.includeToday ?? false;
  const anchor = includeToday ? toStartOfDay(today) : toStartOfDay(addDays(today, -1)); // 基準日
  const endOfAnchor = toEndOfDay(includeToday ? today : addDays(today, -1));

  const startOfWeek = (anchor: Date) => {
    const day = anchor.getDay();
    const mondayOffset = day === 0 ? 6 : day - 1;
    const monday = addDays(anchor, -mondayOffset);
    return toStartOfDay(monday);
  };

  const startOfMonth = (anchor: Date) => toStartOfDay(new Date(anchor.getFullYear(), anchor.getMonth(), 1));

  if (preset === 'custom') {
    const parsedStart = parseDateInput(customStart);
    const parsedEnd = parseDateInput(customEnd);
    if (parsedStart && parsedEnd) {
      const start = toStartOfDay(parsedStart <= parsedEnd ? parsedStart : parsedEnd);
      const end = toEndOfDay(parsedStart <= parsedEnd ? parsedEnd : parsedStart);
      return { start, end, preset };
    }
    // カスタムが選択されているが日付が未入力の場合、デフォルト期間を使用しつつpresetは'custom'を維持
    // これにより日付入力フィールドが表示される
    const defaultRange = resolveDateRange(DEFAULT_PRESET);
    return { start: defaultRange.start, end: defaultRange.end, preset: 'custom' };
  }

  switch (preset) {
    case '1d': {
      const start = toStartOfDay(anchor);
      const end = toEndOfDay(anchor);
      return { start, end, preset };
    }
    case '3d': {
      const start = toStartOfDay(addDays(anchor, -2));
      return { start, end: endOfAnchor, preset };
    }
    case 'this-week': {
      const start = startOfWeek(anchor);
      return { start, end: endOfAnchor, preset };
    }
    case '7d': {
      const start = toStartOfDay(addDays(anchor, -6));
      return { start, end: endOfAnchor, preset };
    }
    case 'last-week': {
      const start = addDays(startOfWeek(anchor), -7);
      const end = toEndOfDay(addDays(start, 6));
      return { start, end, preset };
    }
    case 'this-month': {
      const start = startOfMonth(anchor);
      return { start, end: endOfAnchor, preset };
    }
    case '30d': {
      const start = toStartOfDay(addDays(anchor, -29));
      return { start, end: endOfAnchor, preset };
    }
    case 'last-month': {
      // 先月の1日
      const lastMonthStart = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
      const start = toStartOfDay(lastMonthStart);
      // 先月の最終日
      const lastMonthEnd = new Date(anchor.getFullYear(), anchor.getMonth(), 0);
      const end = toEndOfDay(lastMonthEnd);
      return { start, end, preset };
    }
    case '90d': {
      const start = toStartOfDay(addDays(anchor, -89));
      return { start, end: endOfAnchor, preset };
    }
    case 'all': {
      const start = new Date('2000-01-01T00:00:00');
      return { start, end: endOfAnchor, preset };
    }
    default: {
      return resolveDateRange(DEFAULT_PRESET);
    }
  }
}

export function formatDateInput(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}
