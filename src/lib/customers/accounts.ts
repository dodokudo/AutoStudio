import type { CustomerAccount } from './model';

const text = (value: unknown) => String(value ?? '').trim();
const normalize = (value: unknown) => text(value).normalize('NFKC').toLowerCase();
const nameKey = (value: unknown) => normalize(value).replace(/\s/g, '');

/** Keep the answer even when it is a handle, multiple accounts, or free text. */
export function snsAccounts(name: unknown, answer: unknown): CustomerAccount[] {
  const raw = text(answer), displayName = text(name);
  if (!raw && !displayName) return [];
  const parts = raw.split(/[,、\n]+/).map((s) => s.trim()).filter(Boolean);
  return (parts.length ? parts : ['']).map((part) => {
    let url: string | undefined, id: string | undefined;
    const candidate = /^(www\.)?(instagram\.com|threads\.(net|com)|x\.com|twitter\.com)\//i.test(part)
      ? `https://${part}` : part;
    try {
      const parsed = new URL(candidate);
      if (['https:', 'http:'].includes(parsed.protocol)) {
        url = parsed.href;
        if (/^(www\.)?(instagram\.com|threads\.(net|com)|x\.com|twitter\.com)$/.test(parsed.hostname)) {
          const handle = parsed.pathname.split('/').filter(Boolean)[0]?.replace(/^@/, '');
          if (handle && !['p', 'reel', 'reels', 'stories', 'share', 't'].includes(handle)) id = `@${handle}`;
        }
      }
    } catch {
      const handle = part.replace(/^@/, '').split('?')[0];
      if (/^[a-zA-Z0-9._]+$/.test(handle)) id = `@${handle}`;
    }
    return { platform: 'SNS', name: displayName || (!id && !url ? part : undefined), id, url };
  });
}

export interface AccountAnswer {
  respondentId: string;
  email: string;
  name: string;
  lineName: string;
  answer: string;
}

export function parseAccountAnswers(rows: unknown[][]): AccountAnswer[] {
  const headers = (rows[0] || []).map(text);
  const snsIndex = headers.findIndex((h) => h.startsWith('ThreadsまたはInstagramのアカウント'));
  const required = ['回答者ID', 'メールアドレスを入力してください', 'お名前を入力してください', 'LINE名'];
  if (snsIndex < 0 || required.some((h) => !headers.includes(h))) throw Error('登録時アンケートの見出しを確認してください');
  return rows.slice(1).map((row) => ({
    respondentId: text(row[headers.indexOf(required[0])]),
    email: normalize(row[headers.indexOf(required[1])]),
    name: text(row[headers.indexOf(required[2])]),
    lineName: text(row[headers.indexOf(required[3])]),
    answer: text(row[snsIndex]),
  })).filter((r) => r.respondentId && r.answer);
}

/** Enrich display only. Never change customer keys, purchase dates or revenue. */
export function matchAccountAnswer(
  member: { elmeId: unknown; email: unknown; name: unknown; lineName: unknown },
  answers: AccountAnswer[],
): AccountAnswer | undefined {
  const id = text(member.elmeId), mail = normalize(member.email);
  const matches = answers.filter((a) => id
    ? a.respondentId === id
    : mail
      ? a.email === mail
      : nameKey(member.name) && nameKey(member.lineName) &&
        nameKey(a.name) === nameKey(member.name) && nameKey(a.lineName) === nameKey(member.lineName));
  if (!matches.length || new Set(matches.map((a) => a.respondentId)).size !== 1 ||
      new Set(matches.map((a) => nameKey(a.name))).size !== 1) return undefined;
  return matches.at(-1);
}
