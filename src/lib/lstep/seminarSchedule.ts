/**
 * セミナー日程の自動更新ロジック（純粋関数）。
 *
 * 毎日 12:00 / 20:00 に実行し、
 *   - 開催1時間前になった枠を各所から削除する
 *   - 新しい枠を1つ追加する
 * ために必要な「日付・曜日・タグ名・代入値」を機械的に導出する。
 *
 * 人が曜日を数えたり時刻を書き写したりする箇所を無くすのが目的なので、
 * ここには副作用を持ち込まない（ブラウザ操作は runner 側）。
 */

export const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** 1日に開催する枠の開始時刻（時）。運用が変わったらここだけ直す。 */
export const SLOT_HOURS = [13, 21] as const;
export type SlotHour = (typeof SLOT_HOURS)[number];

export interface SeminarSlot {
  /** 2026-07-24 形式 */
  date: string;
  year: number;
  month: number;
  day: number;
  hour: SlotHour;
  /** 「金」 */
  weekday: string;
  /** タグ名。例: 7月24日13時 */
  tagName: string;
  /** 友だち情報[セミナー申込日]へ代入する値。例: 7/24(金) 13:00~ */
  applicationValue: string;
  /** フォーム/ワンタップの選択肢ラベル。代入値と同一形式で揃える。 */
  choiceLabel: string;
  /** 紐づくリマインダ名。例: 【2026.7】13時回 */
  reminderName: string;
  /** リマインダのゴール日時（現行運用は開催日の22:00固定） */
  reminderGoal: { date: string; time: string };
}

/**
 * 実行時点で申込可能な枠を時系列で返す。
 * 開始1時間前になった枠は含めない（12:00に13時枠、20:00に21時枠を締切）。
 */
export function upcomingSlots(now: Date, count: number, options: BuildSlotOptions = {}): SeminarSlot[] {
  const slots: SeminarSlot[] = [];
  const cutoff = now.getTime() + 60 * 60 * 1000;
  let day = jstDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  while (slots.length < count) {
    for (const hour of SLOT_HOURS) {
      const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour).getTime();
      if (startsAt > cutoff) slots.push(buildSlot(day, hour, options));
      if (slots.length === count) break;
    }
    day = addDays(day, 1);
  }
  return slots;
}

/** 表示用の残席。タグ人数を申込数として、虚偽の希少性を作らない。 */
export function remainingCapacity(memberCount: number, capacity = 20): number {
  return Math.max(0, capacity - memberCount);
}

export function choiceLabelWithCapacity(slot: SeminarSlot, memberCount: number, capacity = 20): string {
  return `${slot.choiceLabel}(残り${remainingCapacity(memberCount, capacity)}名)`;
}

export interface BuildSlotOptions {
  /** リマインダ名の接頭辞。ローンチが変わったら差し替える。 */
  reminderPrefix?: string;
  /** リマインダのゴール時刻（HH:mm）。現行運用は 22:00。 */
  reminderGoalTime?: string;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** JSTの暦日として Date を組み立てる（時刻は 00:00 固定） */
export function jstDate(year: number, month: number, day: number): Date {
  return new Date(year, month - 1, day);
}

export function formatIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function weekdayOf(d: Date): string {
  return WEEKDAY_LABELS[d.getDay()];
}

export function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setDate(d.getDate() + days);
  return next;
}

/**
 * 指定日・指定時刻の枠を組み立てる。
 * 曜日は必ず Date から計算するので、手書きによる曜日ズレが起きない。
 */
export function buildSlot(date: Date, hour: SlotHour, options: BuildSlotOptions = {}): SeminarSlot {
  const prefix = options.reminderPrefix ?? '【2026.7】';
  const goalTime = options.reminderGoalTime ?? '22:00';
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = weekdayOf(date);
  const value = `${month}/${day}(${weekday}) ${hour}:00~`;

  return {
    date: formatIsoDate(date),
    year: date.getFullYear(),
    month,
    day,
    hour,
    weekday,
    tagName: `${month}月${day}日${hour}時`,
    applicationValue: value,
    choiceLabel: value,
    reminderName: `${prefix}${hour}時回`,
    reminderGoal: { date: formatIsoDate(date), time: goalTime },
  };
}

/** 指定日の全枠（13時・21時）を返す */
export function buildSlotsForDate(date: Date, options: BuildSlotOptions = {}): SeminarSlot[] {
  return SLOT_HOURS.map((h) => buildSlot(date, h, options));
}

/**
 * 実行時刻から「今回削除すべき枠」を決める。
 * 12:00 実行 → 当日13時枠、20:00 実行 → 当日21時枠。
 * 開催1時間前に消すことで、締め切った枠が選択肢に残らない。
 */
export function slotToRemoveAt(now: Date, options: BuildSlotOptions = {}): SeminarSlot | null {
  const hour = now.getHours();
  const target = SLOT_HOURS.find((h) => h - 1 === hour);
  if (target === undefined) return null;
  return buildSlot(jstDate(now.getFullYear(), now.getMonth() + 1, now.getDate()), target, options);
}

/**
 * 実行時刻から「今回追加すべき枠」を決める。
 * 削除した枠と同じ時刻の、`horizonDays` 日先の枠を1つ足す。
 * 1回の実行で1枠だけ増やすので、常に一定日数先まで埋まった状態が保たれる。
 */
export function slotToAddAt(now: Date, horizonDays: number, options: BuildSlotOptions = {}): SeminarSlot | null {
  const removed = slotToRemoveAt(now, options);
  if (!removed) return null;
  const base = jstDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  return buildSlot(addDays(base, horizonDays), removed.hour, options);
}

export interface SlotIssue {
  target: string;
  problem: string;
  expected?: string;
  actual?: string;
}

/**
 * 画面から読み取った実際の設定が、あるべき値と一致するかを検査する。
 * 変更後の検証にも、日次の健全性チェックにも使う。
 */
export function verifySlot(
  slot: SeminarSlot,
  actual: { tagName?: string; applicationValue?: string; reminderName?: string; reminderGoalDate?: string; hasCondition?: boolean },
): SlotIssue[] {
  const issues: SlotIssue[] = [];
  if (actual.tagName !== undefined && actual.tagName !== slot.tagName) {
    issues.push({ target: 'タグ名', problem: '不一致', expected: slot.tagName, actual: actual.tagName });
  }
  if (actual.applicationValue !== undefined && normalize(actual.applicationValue) !== normalize(slot.applicationValue)) {
    issues.push({ target: 'セミナー申込日', problem: '不一致', expected: slot.applicationValue, actual: actual.applicationValue });
  }
  if (actual.reminderName !== undefined && actual.reminderName !== slot.reminderName) {
    issues.push({ target: 'リマインダ', problem: '不一致', expected: slot.reminderName, actual: actual.reminderName });
  }
  if (actual.reminderGoalDate !== undefined && actual.reminderGoalDate !== slot.reminderGoal.date) {
    issues.push({ target: 'リマインダ日付', problem: '不一致', expected: slot.reminderGoal.date, actual: actual.reminderGoalDate });
  }
  if (actual.hasCondition) {
    issues.push({ target: 'アクション', problem: '条件ONが付いている（リマインダが予約されない恐れ）' });
  }
  return issues;
}

/** 全角/半角スペースの揺れを吸収して比較する */
function normalize(value: string): string {
  return value.replace(/[\s　]/g, '');
}

/**
 * 新しい枠を挿入する位置。挿入先によってルールが違う。
 *
 * - form: 回答フォームの選択肢。最新の日時をそのまま末尾に足す。
 * - carousel: シナリオのワンタップ。最下段は「回答フォームへ飛ばすボタン」で
 *   日程ではないため、その手前（下から2番目）に入れる。
 *
 * どちらも古い枠が先頭に残るので、削除は常に先頭を対象にできる。
 */
export type ChoiceTarget = 'form' | 'carousel';

export function insertIndexForNewChoice(currentCount: number, target: ChoiceTarget = 'form'): number {
  if (currentCount <= 0) return 0;
  return target === 'carousel' ? Math.max(0, currentCount - 1) : currentCount;
}
