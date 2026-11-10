import type { Customer } from './model';
export const OFFER_LABELS = {
  unknown: '未記録',
  not_offered: '未提案',
  offered: '提案済み',
  declined: '辞退・見送り',
} as const;
export const PROSPECT_LABELS = {
  unknown: '未評価',
  high: '高い',
  medium: '中程度',
  low: '低い',
  none: '見込みなし',
} as const;
export const CLOSING_LABELS = {
  unknown: '未記録',
  pending: '未実施',
  won: '成約',
  lost: '不成約',
  none: '見込みなし',
  not_applicable: '対象外',
} as const;
export interface Followup {
  closing?: keyof typeof CLOSING_LABELS | 'inherit';
  offer: keyof typeof OFFER_LABELS;
  offeredDate: string;
  prospect: keyof typeof PROSPECT_LABELS;
  memo: string;
  updatedAt: string;
}
export const EMPTY_FOLLOWUP: Followup = {
  offer: 'unknown',
  offeredDate: '',
  prospect: 'unknown',
  memo: '',
  updatedAt: '',
};
export function validateFollowup(
  input: unknown,
  today: string,
): Omit<Followup, 'updatedAt'> {
  if (!input || typeof input !== 'object')
    throw Error('入力を確認してください');
  const v = input as Record<string, unknown>;
  if (
    typeof v.offer !== 'string' ||
    !Object.hasOwn(OFFER_LABELS, v.offer) ||
    typeof v.prospect !== 'string' ||
    !Object.hasOwn(PROSPECT_LABELS, v.prospect) ||
    typeof v.offeredDate !== 'string' ||
    typeof v.memo !== 'string' ||
    v.memo.length > 500
  )
    throw Error('提案状況・見込み度・メモを確認してください');
  if (
    v.offeredDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(v.offeredDate) ||
      !Number.isFinite(Date.parse(v.offeredDate)) ||
      new Date(v.offeredDate).toISOString().slice(0, 10) !== v.offeredDate ||
      v.offeredDate > today)
  )
    throw Error('提案日は今日以前の有効な日付にしてください');
  if (v.offer !== 'offered' && v.offeredDate)
    throw Error('提案日を入れる場合は提案済みを選んでください');
  if (
    v.closing !== undefined &&
    v.closing !== 'inherit' &&
    (typeof v.closing !== 'string' || !Object.hasOwn(CLOSING_LABELS, v.closing))
  )
    throw Error('クロージング結果を確認してください');
  return {
    closing: (v.closing as Followup['closing']) || 'inherit',
    offer: v.offer as Followup['offer'],
    offeredDate: v.offeredDate,
    prospect: v.prospect as Followup['prospect'],
    memo: v.memo.trim(),
  };
}
export function legacyClosing(customer: Customer) {
  const values = [
    ...new Set(
      customer.purchases
        .filter((p) => p.roster && p.serviceId === 'frontend')
        .map((p) => p.closingStatus)
        .filter((v): v is string => !!v),
    ),
  ];
  if (!values.length) return { code: 'unknown', label: '記録なし' };
  if (values.length > 1) return { code: 'conflict', label: '記録の確認が必要' };
  const raw = values[0];
  if (raw.toLowerCase() === 'false')
    return { code: 'pending', label: '未実施（旧記録）' };
  if (raw === '未該当')
    return { code: 'not_applicable', label: '未該当（旧記録）' };
  if (raw === '見込み無し')
    return { code: 'none', label: '見込み無し（旧記録）' };
  if (/^済/.test(raw) && /[×✕✖]/.test(raw))
    return { code: 'lost', label: '実施済み・不成約（旧記録）' };
  if (/^済/.test(raw))
    return { code: 'done', label: `実施済み（旧記録：${raw}）` };
  return { code: 'other', label: raw };
}
export function closingRecord(customer: Customer, value?: Followup) {
  if (value?.closing && value.closing !== 'inherit')
    return { code: value.closing, label: CLOSING_LABELS[value.closing] };
  const old = legacyClosing(customer);
  const code = old.code === 'done' ? 'won' : old.code;
  return {
    code,
    label: Object.hasOwn(CLOSING_LABELS, code)
      ? CLOSING_LABELS[code as keyof typeof CLOSING_LABELS]
      : old.label,
  };
}
export function needsOfferReview(customer: Customer, value?: Followup) {
  if (
    customer.purchases.some(
      (p) =>
        p.serviceId === 'backend' &&
        p.acquisition &&
        p.membership !== 'registered',
    )
  )
    return false;
  if (value?.offer && value.offer !== 'unknown') return false;
  if (value?.prospect === 'none' || value?.prospect === 'low') return false;
  return ['unknown', 'pending', 'not_applicable'].includes(
    closingRecord(customer, value).code,
  );
}
