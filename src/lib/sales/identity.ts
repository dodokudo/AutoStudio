import type { CustomerProfile } from './customerProfiles';

export const normalizeSalesName = (value: string) =>
  value.normalize('NFKC').toLocaleLowerCase('ja-JP').replace(/[\s　]+/g, '').trim();

export const isUnknownSalesName = (value: string | undefined) =>
  !value?.trim() || /^(?:-|不明|購入者不明.*|購入者名未確認.*)$/.test(value.trim());

// User-confirmed aliases. Keep raw bank/payment names in their source records.
const aliases = new Map([
  ['内山章', '内山明'], ['内山章：断熱カントク', '内山明'],
  ['アキラ内山', '内山明'], ['内山アキラ', '内山明'],
  ['AKIRA UCHIYAMA', '内山明'], ['UCHIYAMA AKIRA', '内山明'],
  ['マシモ ナギ', '眞下渚'], ['マシモ ナギサ', '眞下渚'], ['サトウ ヤヨイ', '佐藤弥生'],
  ['株式会社Ｂｅ　Ｃｏｎｆｉｄｅｎｔ　伊藤　沙織', '伊藤沙織'],
  ['株式会社ビーコンフィデンス 伊藤沙織', '伊藤沙織'],
].map(([alias, name]) => [normalizeSalesName(alias), name]));

export const canonicalSalesName = (value: string) => aliases.get(normalizeSalesName(value)) ?? value;

export function createSalesNameResolver(profiles: CustomerProfile[]) {
  const names = new Map<string, Set<string>>();
  for (const profile of profiles) {
    for (const alias of [profile.customerKey, profile.displayName, ...profile.aliases]) {
      const key = normalizeSalesName(canonicalSalesName(alias));
      if (!key || isUnknownSalesName(alias)) continue;
      const values = names.get(key) ?? new Set<string>();
      values.add(profile.displayName);
      names.set(key, values);
    }
  }
  return (name: string) => {
    const canonical = canonicalSalesName(name);
    const candidates = names.get(normalizeSalesName(canonical));
    return candidates?.size === 1 ? [...candidates][0] : canonical;
  };
}

export interface FormIdentity {
  name: string;
  email: string;
  answerId: string;
  respondentId: string;
  lineName: string;
  lineUserId?: string;
}

export function parseFormIdentities(rows: unknown[][]): FormIdentity[] {
  const header = rows[0]?.map(String) ?? [];
  const nameIndex = header.indexOf('お名前を入力してください');
  const emailIndex = header.indexOf('メールアドレスを入力してください');
  if (nameIndex < 0 || emailIndex < 0) throw new Error('回答シートの氏名・メール列を確認してください');
  return rows.slice(1).flatMap((row) => {
    const name = String(row[nameIndex] ?? '').trim();
    const email = String(row[emailIndex] ?? '').normalize('NFKC').trim().toLowerCase();
    if (isUnknownSalesName(name) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return [];
    return [{ name, email, answerId: String(row[header.indexOf('回答ID')] ?? ''),
      respondentId: String(row[header.indexOf('回答者ID')] ?? ''),
      lineName: String(row[header.indexOf('LINE名')] ?? ''),
      lineUserId: String(row[header.indexOf('LINE ユーザーID')] ?? '') }];
  });
}

export function matchFormIdentity(email: string, identities: FormIdentity[]): FormIdentity | undefined {
  const key = email.normalize('NFKC').trim().toLowerCase();
  const matches = identities.filter((identity) => identity.email === key);
  // Shared addresses and conflicting answers require human review.
  if (!matches.length || new Set(matches.map((m) => normalizeSalesName(m.name))).size !== 1 ||
      new Set(matches.map((m) => m.respondentId).filter(Boolean)).size > 1) return undefined;
  return matches[matches.length - 1];
}
