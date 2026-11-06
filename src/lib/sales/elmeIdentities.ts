import { google } from 'googleapis';
import { getTransactionContact, type UnivaPayCharge } from '../univapay/client';
import { createSalesNameResolver, isUnknownSalesName, matchFormIdentity, parseFormIdentities, type FormIdentity } from './identity';
import type { CustomerProfile } from './customerProfiles';

export const ELME_IDENTITY_SHEET = '1kK2EKZ2YyjCwpmBbVFvIwZswZkGNpFrAAwejeLm2Kzo';
let sheetCache: { expires: number; identities: FormIdentity[] } | undefined;
const contacts = new Map<string, { expires: number; email: string; name: string }>();

export async function readElmeIdentities(): Promise<FormIdentity[]> {
  if (sheetCache && sheetCache.expires > Date.now()) return sheetCache.identities;
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const credentials = raw ? JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')) : undefined;
  if (credentials?.private_key) credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  const auth = new google.auth.GoogleAuth({ credentials,
    keyFile: credentials ? undefined : process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const result = await google.sheets({ version: 'v4', auth }).spreadsheets.values.get({
    spreadsheetId: ELME_IDENTITY_SHEET, range: "'シート1'!A:H",
  }, { timeout: 15000 });
  const identities = parseFormIdentities(result.data.values ?? []);
  sheetCache = { identities, expires: Date.now() + 5 * 60_000 };
  return identities;
}

export async function enrichSalesIdentities(
  charges: UnivaPayCharge[], profiles: CustomerProfile[],
  loadIdentities = readElmeIdentities,
  loadContact = getTransactionContact,
) {
  const resolveName = createSalesNameResolver(profiles);
  const warnings: string[] = [];
  let identities: FormIdentity[] = [];
  try { identities = await loadIdentities(); } catch {
    warnings.push('回答シートを取得できないため、フォームからの購入者名補完が未完了です。');
  }
  const byToken = new Map<string, { name: string; answerId?: string }>();
  const tokens = [...new Set(charges.filter((c) => c.status === 'successful' &&
    isUnknownSalesName(c.metadata?.['univapay-name'])).map((c) => c.transaction_token_id).filter(Boolean))];
  let failed = 0;
  for (let i = 0; i < tokens.length; i += 5) {
    await Promise.all(tokens.slice(i, i + 5).map(async (id) => {
      try {
        let contact = contacts.get(id);
        if (!contact || contact.expires <= Date.now()) {
          contact = { ...await loadContact(id), expires: Date.now() + 60 * 60_000 };
          contacts.set(id, contact);
        }
        const match = matchFormIdentity(contact.email, identities);
        const name = match?.name || contact.name;
        if (!isUnknownSalesName(name)) byToken.set(id, { name: resolveName(name), answerId: match?.answerId });
      } catch { failed++; }
    }));
  }
  if (failed) warnings.push(`決済者情報を取得できない決済手段が${failed}件あります。`);
  let matched = 0;
  const enriched = charges.map((charge) => {
    const rawName = charge.metadata?.['univapay-name'] ?? '';
    const match = isUnknownSalesName(rawName) ? byToken.get(charge.transaction_token_id) : undefined;
    if (match?.answerId) matched++;
    const name = match?.name || resolveName(rawName);
    return { ...charge, metadata: { ...charge.metadata,
      ...(name ? { 'univapay-name': name } : {}),
      ...(match?.answerId ? { salesIdentitySource: 'elme-email', salesIdentityAnswerId: match.answerId } : {}),
    } };
  });
  return { charges: enriched, warnings, matched };
}
