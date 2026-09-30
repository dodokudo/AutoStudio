import type { KpiTargetInput } from './kpi-types';

export const goalFields = [
  ['targetRevenue', '売上', '万円'],
  ['targetBackendPurchases', 'バックエンド購入', '件'],
  ['targetFrontendPurchases', 'フロントエンド購入', '件'],
  ['targetLineRegistrations', 'LINE登録', '件'],
  ['targetSeminarRegistrations', 'セミナー申込み', '件'],
  ['targetSeminarParticipants', 'セミナー参加', '件'],
  ['targetConsultationRegistrations', '個別相談申込み', '件'],
  ['targetConsultationsCompleted', '個別相談実施', '件'],
  ['targetThreadsFollowers', 'Threadsフォロワー増加', '人'],
  ['targetInstagramFollowers', 'Instagramフォロワー増加', '人'],
] as const;
export const activityFields = [
  ['seminarRegistrations', 'セミナー申込み', 'targetSeminarRegistrations'],
  ['seminarParticipants', 'セミナー参加', 'targetSeminarParticipants'],
  ['consultationRegistrations', '個別相談申込み', 'targetConsultationRegistrations'],
  ['consultationsCompleted', '個別相談実施', 'targetConsultationsCompleted'],
] as const;
export type ActivityKey = (typeof activityFields)[number][0];
export type ActivityActuals = Record<ActivityKey, number | null>;
export interface MonthlyTask {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  dueDate: string;
  completed: number;
  total: number;
  archived: boolean;
}
export interface MonthlyPlan {
  month: string;
  revision: number;
  tasks: MonthlyTask[];
  activities: ActivityActuals;
}
export const isMonth = (value: unknown): value is string =>
  typeof value === 'string' && /^20\d{2}-(0[1-9]|1[0-2])$/.test(value);
export function monthDates(month: string) {
  if (!isMonth(month)) throw new Error('対象月を確認してください');
  const [year, number] = month.split('-').map(Number);
  return { start: `${month}-01`, end: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10) };
}
export function emptyMonthlyPlan(month: string): MonthlyPlan {
  return {
    month,
    revision: 0,
    tasks: [],
    activities: {
      seminarRegistrations: null,
      seminarParticipants: null,
      consultationRegistrations: null,
      consultationsCompleted: null,
    },
  };
}
export function percentage(numerator: number | null | undefined, denominator: number | null | undefined): string {
  return numerator == null || denominator == null || denominator <= 0
    ? '—'
    : `${((numerator / denominator) * 100).toFixed(1)}%`;
}
export function conversionRows(values: {
  line: number | null;
  seminarApplications: number | null;
  seminarAttendance: number | null;
  consultationApplications: number | null;
  consultations: number | null;
  backend: number | null;
}) {
  return [
    ['LINE登録 → セミナー申込み', percentage(values.seminarApplications, values.line)],
    ['セミナー申込み → 参加', percentage(values.seminarAttendance, values.seminarApplications)],
    ['LINE登録 → 個別相談申込み', percentage(values.consultationApplications, values.line)],
    ['個別相談申込み → 実施', percentage(values.consultations, values.consultationApplications)],
    ['個別相談実施 → バックエンド購入', percentage(values.backend, values.consultations)],
  ];
}
export function targetConversionRows(target: KpiTargetInput) {
  const set = (n: number) => (n > 0 ? n : null);
  return conversionRows({
    line: set(target.targetLineRegistrations),
    seminarApplications: set(target.targetSeminarRegistrations),
    seminarAttendance: set(target.targetSeminarParticipants),
    consultationApplications: set(target.targetConsultationRegistrations),
    consultations: set(target.targetConsultationsCompleted),
    backend: set(target.targetBackendPurchases),
  });
}
export function validateMonthlyPlan(value: MonthlyPlan): string | null {
  if (!isMonth(value?.month) || !Number.isSafeInteger(value.revision) || value.revision < 0)
    return '対象月を確認してください';
  if (!Array.isArray(value.tasks) || value.tasks.length > 200 || !value.activities) return '入力内容を確認してください';
  const count = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
  if (activityFields.some(([key]) => value.activities[key] !== null && !count(value.activities[key])))
    return '実績は0以上の整数で入力してください';
  const ids = new Set<string>();
  for (const task of value.tasks) {
    if (!task || typeof task.id !== 'string' || !task.id || task.id.length > 100 || ids.has(task.id))
      return 'タスクIDが不正です';
    ids.add(task.id);
    if (typeof task.title !== 'string' || !task.title.trim() || task.title.length > 300)
      return 'タスク名を入力してください（300文字以内）';
    if (!['todo', 'in_progress', 'done'].includes(task.status) || typeof task.archived !== 'boolean')
      return '状態を確認してください';
    if (!count(task.total) || task.total < 1 || !count(task.completed) || task.completed > task.total)
      return '進捗は0以上、目標以下で入力してください';
    if (task.status === 'done' && task.completed !== task.total) return '完了時は進捗を目標と同じ数にしてください';
    if (
      typeof task.dueDate !== 'string' ||
      (task.dueDate &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate) ||
          Number.isNaN(Date.parse(task.dueDate)) ||
          new Date(task.dueDate).toISOString().slice(0, 10) !== task.dueDate))
    )
      return '期限の日付を確認してください';
  }
  return null;
}
