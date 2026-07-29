export const EXPENSE_CATEGORIES = [
  { id: 'payment_fee', label: '決済手数料' },
  { id: 'class_cost', label: '講師・授業費' },
  { id: 'advertising', label: '広告費' },
  { id: 'outsourcing', label: '外注費' },
  { id: 'system', label: 'システム費' },
  { id: 'other', label: 'その他' },
] as const;

export const EXPENSE_TYPES = [
  { id: 'direct', label: '直接原価' },
  { id: 'operating', label: '運営費' },
] as const;

export const EXPENSE_BUSINESS_UNITS = [
  { id: 'course', label: '講座' },
  { id: 'analyca', label: 'ANALYCA' },
  { id: 'shared', label: '共通' },
] as const;

export type ExpenseCategoryId = (typeof EXPENSE_CATEGORIES)[number]['id'];
export type ExpenseTypeId = (typeof EXPENSE_TYPES)[number]['id'];
export type ExpenseBusinessUnitId = (typeof EXPENSE_BUSINESS_UNITS)[number]['id'];
export type ExpenseSource = 'manual' | 'moneyforward';

export interface SalesExpense {
  id: string;
  amount: number;
  category: ExpenseCategoryId;
  expenseType: ExpenseTypeId;
  businessUnit: ExpenseBusinessUnitId;
  description: string;
  expenseDate: string;
  createdAt: string;
  source: ExpenseSource;
  sourceCategory?: string;
  sourceGroup?: string;
  sourceColor?: string;
  sourceAccount?: string;
}
