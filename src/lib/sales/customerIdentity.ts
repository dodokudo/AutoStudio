import { normalizeSalesName, type FormIdentity } from './identity';

export const GUARDIAN_CUSTOMER_SHEET = '1LXrPBtbECWx51NQj9KrOBZFu5IOOIQluI2wmhS1_FyI';
export const IDENTITY_CATEGORIES = new Set(['frontend', 'backend', 'backend_renewal', 'backend_performance']);
export interface GuardianIdentity {
  name: string; email: string; elmeId: string; lstepId: string;
  registeredDate: string; dateEvidence: string; source: string;
  idEvidence?: string;
}
export interface ReviewedSalesIdentity {
  revenueKey: string; guardianSource: string; lstepId: string; customerKey: string; evidence: string;
  expected: { amount: number; date: string; category: string; name: string };
}
export interface PaymentTag {
  userId: string; paymentMethod: string; classificationStatus: string;
  sourceComplete: boolean; snapshotDate: string;
}
export interface SalesCustomerLink {
  revenueKey: string;
  saleType: 'charge' | 'manual'; saleId: string; customerKey: string;
  elmeId: string; lstepId: string; lineUserId: string;
  customerName: string; lineName: string;
  registeredDate: string; dateEvidence: string;
  status: 'confirmed' | 'pending' | 'conflict'; reason: string;
  sources: string[]; matchedAt: string;
  paymentTag?: PaymentTag;
  paymentTagReason?: string;
}
const text = (value: unknown) => String(value ?? '').trim();
const emailKey = (value: string) => value.normalize('NFKC').trim().toLowerCase();
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

export function parseGuardianIdentities(rows: unknown[][], tab: string, notes: Record<string, string> = {}): GuardianIdentity[] {
  const headerRow = rows.findIndex(row => row.includes('エルメ友だちID') && row.includes('メールアドレス'));
  if (headerRow < 0) throw new Error(`顧客シートのID列がありません: ${tab}`);
  const headers = rows[headerRow].map(text);
  const read = (row: unknown[], label: string) => text(row[headers.indexOf(label)]);
  return rows.slice(headerRow + 1).flatMap((row, index) => {
    const elmeId = read(row, 'エルメ友だちID');
    const lstepId = read(row, 'LステップユーザーID');
    if (!elmeId && !lstepId) return [];
    return [{ name: read(row, '名前'), email: emailKey(read(row, 'メールアドレス')), elmeId, lstepId,
      registeredDate: read(row, '購入日（確認済）'), dateEvidence: read(row, '購入日根拠'),
      idEvidence: notes[`${tab}:${headerRow + index + 2}`] ?? '',
      source: `https://docs.google.com/spreadsheets/d/${GUARDIAN_CUSTOMER_SHEET}/edit#range=${encodeURIComponent(`${tab}!A${headerRow + index + 2}`)}` }];
  });
}

export function assessPaymentTag(tag: PaymentTag | undefined, existingMethod: string, now: string): string {
  if (!tag) return '支払タグなし';
  const age = Date.parse(now) - Date.parse(`${tag.snapshotDate}T00:00:00+09:00`);
  if (!Number.isFinite(age) || age > 3 * 86400000 || age < -86400000) return '支払タグの更新日を要確認';
  if (!tag.sourceComplete || tag.classificationStatus !== 'classified' || !['bank', 'card'].includes(tag.paymentMethod)) return '支払タグが未確定・競合';
  const method = /カード|card/i.test(existingMethod) ? 'card' : /銀行|振込|bank/i.test(existingMethod) ? 'bank' : '';
  return method && method !== tag.paymentMethod ? '既存の支払方法とタグが相違（既存値を維持）' : '';
}

// No name/date/amount joins. An exact email or existing explicit Elme ID is required.
export function matchSalesCustomer(input: {
  revenueKey: string; email: string; elmeId?: string; paymentMethod: string;
}, forms: FormIdentity[], guardian: GuardianIdentity[], tags: PaymentTag[], now: string): SalesCustomerLink {
  const base: SalesCustomerLink = { revenueKey: input.revenueKey, elmeId: '', lstepId: '', lineUserId: '',
    saleType: input.revenueKey.startsWith('charge:') ? 'charge' : 'manual', saleId: input.revenueKey.slice(input.revenueKey.indexOf(':') + 1), customerKey: '',
    customerName: '', lineName: '', registeredDate: '', dateEvidence: '', status: 'pending',
    reason: '', sources: [], matchedAt: now };
  const email = emailKey(input.email);
  if (!email && !input.elmeId) return { ...base, reason: 'メール・確認済みIDがなく照合保留（氏名のみでは確定しません）' };
  const formMatches = forms.filter(row => (email && emailKey(row.email) === email) || (input.elmeId && row.respondentId === input.elmeId));
  const initialRows = guardian.filter(row => (email && row.email === email) || (input.elmeId && row.elmeId === input.elmeId));
  const ids = unique([input.elmeId ?? '', ...formMatches.map(row => row.respondentId), ...initialRows.map(row => row.elmeId)]);
  const conflict = (reason: string) => ({ ...base, status: 'conflict' as const, reason });
  if (ids.length > 1 || unique(formMatches.map(row => normalizeSalesName(row.name))).length > 1 || unique(formMatches.map(row => row.lineUserId ?? '')).length > 1)
    return conflict('同じメールに複数の顧客候補があります');
  if (!ids.length) return { ...base, reason: 'メールに一致するエルメIDがありません' };
  const elmeId = ids[0];
  // Check all rows for the ID, including other email addresses: never arbitrarily choose a mapping.
  const rows = guardian.filter(row => row.elmeId === elmeId || initialRows.includes(row));
  const lstepIds = unique(rows.map(row => row.lstepId));
  const otherElme = guardian.filter(row => row.lstepId && lstepIds.includes(row.lstepId) && row.elmeId && row.elmeId !== elmeId);
  if (lstepIds.length > 1 || otherElme.length) return conflict('エルメIDとLステップIDの対応が競合しています');
  const idForms = forms.filter(row => row.respondentId === elmeId);
  const lineIds = unique(idForms.map(row => row.lineUserId ?? ''));
  if (lineIds.length > 1) return conflict('エルメIDとLINEユーザーIDの対応が競合しています');
  const form = formMatches.at(-1) ?? idForms.at(-1);
  const dates = unique(rows.map(row => row.registeredDate));
  const lstepId = lstepIds[0] ?? '';
  const paymentTag = tags.find(row => row.userId === lstepId);
  return { ...base, elmeId, lstepId, customerKey: lstepId ? `lstep:${lstepId}` : `elme:${elmeId}`, lineUserId: lineIds[0] ?? '', customerName: form?.name ?? rows[0]?.name ?? '',
    lineName: form?.lineName ?? '', registeredDate: dates.length === 1 ? dates[0] : '',
    dateEvidence: dates.length === 1 ? unique(rows.map(row => row.dateEvidence)).join(' / ') : '',
    status: 'confirmed', reason: lstepId ? '' : '顧客シートのLステップID未登録',
    sources: unique([...rows.map(row => row.source), ...formMatches.map(row => `エルメ回答:${row.answerId}（メール完全一致・回答者ID）`)]),
    paymentTag, paymentTagReason: lstepId ? assessPaymentTag(paymentTag, input.paymentMethod, now) : '' };
}

// Explicit per-sale review can link bank transfers and backend-only customers without an Elme ID.
// The caller must compare expected financial fields with the current sale before using the review.
export function applyReviewedIdentity(base: SalesCustomerLink, review: ReviewedSalesIdentity, guardian: GuardianIdentity[], forms: FormIdentity[], tags: PaymentTag[], method: string, now: string): SalesCustomerLink {
  if (base.revenueKey !== review.revenueKey || !review.evidence.trim() || !review.customerKey) throw new Error('Invalid identity review');
  const source = guardian.find(row => row.source === review.guardianSource && row.lstepId === review.lstepId && row.idEvidence);
  if (!source) throw new Error(`Reviewed Guardian ID or evidence changed: ${review.revenueKey}`);
  if (base.status === 'conflict') return base;
  const rows = guardian.filter(row => row.lstepId === review.lstepId);
  const elmeIds = unique([base.elmeId, ...rows.map(row => row.elmeId)]);
  if (elmeIds.length > 1 || (base.lstepId && base.lstepId !== review.lstepId)) return { ...base, status: 'conflict', reason: '確認済みの顧客IDと契約照合が相違しています' };
  const elmeId = elmeIds[0] ?? '';
  const idForms = elmeId ? forms.filter(row => row.respondentId === elmeId) : [];
  const lineIds = unique([base.lineUserId, ...idForms.map(row => row.lineUserId ?? '')]);
  if (lineIds.length > 1) return { ...base, status: 'conflict', reason: 'LINEユーザーIDが競合しています' };
  const dates = unique(rows.map(row => row.registeredDate));
  const paymentTag = tags.find(row => row.userId === review.lstepId);
  return { ...base, status: 'confirmed', reason: elmeId ? '' : 'エルメIDは未確認', elmeId, lstepId: review.lstepId,
    customerKey: `lstep:${review.lstepId}`, lineUserId: lineIds[0] ?? '', customerName: base.customerName || source.name,
    lineName: base.lineName || idForms[0]?.lineName || '',
    registeredDate: base.registeredDate || (dates.length === 1 ? dates[0] : ''),
    dateEvidence: base.dateEvidence || (dates.length === 1 ? unique(rows.map(row => row.dateEvidence)).join(' / ') : ''),
    sources: unique([...base.sources, ...rows.map(row => row.source), source.idEvidence!, `顧客キー:${review.customerKey}`, review.evidence]),
    paymentTag, paymentTagReason: assessPaymentTag(paymentTag, method, now), matchedAt: now };
}

// An import may fill blanks, but cannot silently replace a previously confirmed ID.
export function mergeCustomerLink(previous: SalesCustomerLink | undefined, next: SalesCustomerLink): SalesCustomerLink {
  if (!previous || (!previous.elmeId && !previous.lstepId && !previous.lineUserId)) return next;
  const conflict = (['elmeId', 'lstepId', 'lineUserId'] as const).some(key => previous[key] && next[key] && previous[key] !== next[key]);
  if (conflict || next.status !== 'confirmed') return { ...previous, status: 'conflict', reason: '保存済みIDを維持。再照合の結果を確認してください' };
  return { ...next, elmeId: previous.elmeId || next.elmeId, lstepId: previous.lstepId || next.lstepId,
    lineUserId: previous.lineUserId || next.lineUserId, registeredDate: previous.registeredDate || next.registeredDate,
    dateEvidence: previous.dateEvidence || next.dateEvidence, sources: unique([...previous.sources, ...next.sources]) };
}

// Explicitly verified common LSTEP IDs can carry independently verified Elme/LINE IDs across purchases.
export function completeCustomerLinks(links: SalesCustomerLink[]): SalesCustomerLink[] {
  return links.map(link => {
    if (link.status !== 'confirmed' || !link.lstepId) return link;
    const peers = links.filter(row => row.status === 'confirmed' && row.lstepId === link.lstepId);
    const elmeIds = unique(peers.map(row => row.elmeId));
    const lineIds = unique(peers.map(row => row.lineUserId));
    if (elmeIds.length > 1 || lineIds.length > 1) return { ...link, status: 'conflict', reason: '共通LステップIDの顧客情報が競合しています' };
    const sources = peers.filter(row => row.elmeId || row.lineUserId);
    return { ...link, elmeId: link.elmeId || elmeIds[0] || '', lineUserId: link.lineUserId || lineIds[0] || '',
      reason: elmeIds.length && link.reason === 'エルメIDは未確認' ? '' : link.reason,
      sources: unique([...link.sources, ...sources.filter(row => row.revenueKey !== link.revenueKey).map(row => `確認済みLステップID共有:${row.revenueKey}`)]) };
  });
}
