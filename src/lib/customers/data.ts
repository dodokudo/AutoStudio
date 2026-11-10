import { google } from 'googleapis';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getChargesFromBigQuery } from '@/lib/sales/charges';
import { getChargeCategories, getManualSales } from '@/lib/sales/categories';
import { getSalesCustomerLinks } from '@/lib/sales/customerLinks';
import { getAnalycaCustomerIdentities } from '@/lib/sales/analycaCustomers';
import {
  GUARDIAN_CUSTOMER_SHEET,
  type SalesCustomerLink,
} from '@/lib/sales/customerIdentity';
import {
  classifyService,
  type CustomerAccount,
  type CustomerDataset,
  type Purchase,
  type ServiceDefinition,
} from './model';

const tabs = [
  {
    title: 'Threads×AIマスター講座メンバーリスト',
    category: 'frontend',
    gid: 428347889,
  },
  { title: 'SNSマーケ講座メンバーリスト', category: 'backend', gid: 914006168 },
];
const text = (v: unknown) => String(v ?? '').trim();
const email = (v: unknown) => text(v).normalize('NFKC').toLowerCase();
function date(v: unknown): string | null {
  if (typeof v === 'number' && v > 20000 && v < 100000)
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5)
      .toISOString()
      .slice(0, 10);
  const s = text(v).slice(0, 10).replaceAll('/', '-');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    Number.isFinite(Date.parse(s)) &&
    new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s
    ? s
    : null;
}
const jstDay = (v: string) =>
  Number.isFinite(Date.parse(v))
    ? new Date(Date.parse(v) + 9 * 3600e3).toISOString().slice(0, 10)
    : null;

function sheetAccounts(
  snsName: unknown,
  snsUrl: unknown,
  lineName: unknown,
  elme: unknown,
  lstep: unknown,
): CustomerAccount[] {
  const accounts: CustomerAccount[] = [];
  if (text(snsName) || text(snsUrl)) {
    let url: string | undefined, id: string | undefined;
    try {
      const parsed = new URL(text(snsUrl));
      if (['https:', 'http:'].includes(parsed.protocol)) {
        url = parsed.href;
        if (
          /^(www\.)?(instagram\.com|threads\.net|threads\.com|x\.com|twitter\.com)$/.test(
            parsed.hostname,
          )
        ) {
          const handle = parsed.pathname
            .split('/')
            .filter(Boolean)[0]
            ?.replace(/^@/, '');
          if (
            handle &&
            !['p', 'reel', 'reels', 'stories', 'share', 't'].includes(handle)
          )
            id = handle;
        }
      }
    } catch {
      if (/^@[a-zA-Z0-9._]+$/.test(text(snsUrl))) id = text(snsUrl).slice(1);
    }
    accounts.push({
      platform: 'SNS',
      name: text(snsName) || undefined,
      id: id ? `@${id}` : undefined,
      url,
    });
  }
  if (text(lineName)) accounts.push({ platform: 'LINE', name: text(lineName) });
  if (text(elme)) accounts.push({ platform: 'エルメ', id: text(elme) });
  if (text(lstep)) accounts.push({ platform: 'Lステップ', id: text(lstep) });
  return accounts;
}

interface SheetPurchase extends Purchase {
  email: string;
  paymentId: string;
}
async function readGuardian(
  services: ServiceDefinition[],
): Promise<{ purchases: SheetPurchase[]; snapshotAt?: string }> {
  let snapshot:
    | { capturedAt: string; valueRanges: { values?: unknown[][] }[] }
    | undefined;
  if (process.env.NODE_ENV !== 'production') {
    try {
      snapshot = JSON.parse(
        await readFile(
          path.join(process.cwd(), '.local/customer-guardian-snapshot.json'),
          'utf8',
        ),
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    }
  }
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const credentials = raw
    ? JSON.parse(
        raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'),
      )
    : undefined;
  if (credentials?.private_key)
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  const auth = new google.auth.GoogleAuth({
    credentials,
    keyFile: credentials
      ? undefined
      : process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const result = snapshot
    ? { data: { valueRanges: snapshot.valueRanges } }
    : await google
        .sheets({ version: 'v4', auth })
        .spreadsheets.values.batchGet(
          {
            spreadsheetId: GUARDIAN_CUSTOMER_SHEET,
            ranges: tabs.map((t) => `'${t.title}'!A1:BG1000`),
            valueRenderOption: 'UNFORMATTED_VALUE',
          },
          { timeout: 20000 },
        );
  const purchases = tabs.flatMap((tab, i) => {
    const rows = result.data.valueRanges?.[i].values || [],
      headers = (rows[1] || []).map(text);
    if (!headers.includes('エルメ友だちID') || headers[1] !== '名前')
      throw Error('顧客シートの見出しを確認してください');
    const col = (r: unknown[], label: string) => r[headers.indexOf(label)];
    return rows.slice(2).flatMap((r, index) => {
      if (!text(r[1]) && !text(r[3])) return [];
      if (/テスト/.test(text(r[1]))) return [];
      const paymentId = text(col(r, '決済・入金照合ID'));
      // A backend marker in the front sheet is not proof of a front purchase.

      const aliases = [
        text(col(r, 'エルメ友だちID'))
          ? `elme:${text(col(r, 'エルメ友だちID'))}`
          : '',
        text(col(r, 'LステップユーザーID'))
          ? `lstep:${text(col(r, 'LステップユーザーID'))}`
          : '',
      ].filter(Boolean);
      const evidence = text(col(r, '購入日根拠'));
      const verifiedDate =
        date(col(r, '決済・入金日（実取引）')) ||
        (!/エルメ|友だち|登録日/.test(evidence) && evidence
          ? date(col(r, '購入日（確認済）'))
          : null);
      const acquisitionDate =
        verifiedDate ||
        (tab.category === 'backend'
          ? date(r[8])
          : !evidence
            ? date(r[6])
            : null);
      const purchased =
        Number(r[tab.category === 'frontend' ? 8 : 14]) > 0 || !!paymentId;
      return [
        {
          id: `sheet:${tab.gid}:${index + 3}`,
          aliases,
          name: text(r[1]),
          realName: text(r[1]),
          accounts: sheetAccounts(
            r[2],
            r[tab.category === 'frontend' ? 5 : 4],
            r[3],
            col(r, 'エルメ友だちID'),
            col(r, 'LステップユーザーID'),
          ),
          lineName: text(r[3]),
          email: email(col(r, 'メールアドレス')),
          serviceId: classifyService(tab.category, '', services),
          date: acquisitionDate,
          dateBasis: verifiedDate
            ? '確認済み購入・入金日'
            : acquisitionDate
              ? '顧客シートの契約日'
              : '購入日未確認',
          amount: Number(r[tab.category === 'frontend' ? 8 : 14]) || null,
          amountKind: 'contract' as const,
          acquisition: purchased,
          roster: true,
          closingStatus:
            tab.category === 'frontend'
              ? text(col(r, 'クロージング'))
              : undefined,
          membership: purchased
            ? ('purchased' as const)
            : ('registered' as const),
          source: '顧客管理シート',
          sourceUrl: `https://docs.google.com/spreadsheets/d/${GUARDIAN_CUSTOMER_SHEET}/edit#gid=${tab.gid}&range=A${index + 3}`,
          paymentId,
        },
      ];
    });
  });
  return { purchases, snapshotAt: snapshot?.capturedAt };
}
let cache: { key: string; expires: number; data: CustomerDataset } | undefined;
let pending: { key: string; promise: Promise<CustomerDataset> } | undefined;
export async function loadCustomerDataset(
  services: ServiceDefinition[],
): Promise<CustomerDataset> {
  const key = JSON.stringify(services);
  if (cache?.key === key && cache.expires > Date.now()) return cache.data;
  if (pending?.key === key) return pending.promise;
  const promise = load(services)
    .then((data) => {
      cache = { key, expires: Date.now() + 300000, data };
      return data;
    })
    .finally(() => {
      if (pending?.promise === promise) pending = undefined;
    });
  pending = { key, promise };
  return promise;
}
async function load(services: ServiceDefinition[]): Promise<CustomerDataset> {
  const now = new Date().toISOString(),
    today = jstDay(now)!;
  const warnings: string[] = [];
  const [
    chargesResult,
    manualResult,
    linksResult,
    analycaResult,
    sheetsResult,
  ] = await Promise.allSettled([
    getChargesFromBigQuery('2020-01-01T00:00:00+09:00', now),
    getManualSales('2020-01-01', today),
    getSalesCustomerLinks(),
    getAnalycaCustomerIdentities(),
    readGuardian(services),
  ]);
  const value = <T>(
    r: PromiseSettledResult<T>,
    fallback: T,
    label: string,
  ): T => {
    if (r.status === 'fulfilled') return r.value;
    warnings.push(
      `${label}を取得できませんでした。取得できた範囲のみ表示しています。`,
    );
    console.error('[customers] source failed', label);
    return fallback;
  };
  const charges = value(chargesResult, [], 'カード決済'),
    manual = value(manualResult, [], '手動・銀行売上'),
    links = value(linksResult, [], '顧客ID対応表'),
    analyca = value(analycaResult, [], 'ANALYCA顧客'),
    sheetResult = value(sheetsResult, { purchases: [] }, '顧客管理シート'),
    sheets = sheetResult.purchases;
  let categories = new Map<string, string>();
  try {
    categories = await getChargeCategories(charges.map((c) => c.id));
  } catch {
    warnings.push(
      '売上カテゴリを取得できませんでした。商品情報による分類のみ表示しています。',
    );
  }
  if (
    chargesResult.status === 'rejected' &&
    manualResult.status === 'rejected' &&
    sheetsResult.status === 'rejected'
  )
    throw Error(
      '購入データを取得できませんでした。接続を確認して再読み込みしてください。',
    );
  const linkMap = new Map(links.map((l) => [l.revenueKey, l]));
  const linkAliases = (l?: SalesCustomerLink) =>
    l?.status === 'confirmed'
      ? [
          ...new Set(
            [
              l.elmeId ? `elme:${l.elmeId}` : '',
              l.lstepId ? `lstep:${l.lstepId}` : '',
              l.customerKey,
            ].filter(Boolean),
          ),
        ]
      : [];
  const proofs = new Map<string, SheetPurchase[]>();
  for (const s of sheets)
    if (s.paymentId)
      proofs.set(s.paymentId, [...(proofs.get(s.paymentId) || []), s]);
  const purchases: Purchase[] = [];
  const proofFor = (id: string) => {
    const found = proofs.get(id) || [];
    return found.length === 1 ? found[0] : undefined;
  };
  for (const c of charges) {
    if (c.status !== 'successful' || c.mode !== 'live') continue;
    const metadata = c.metadata || {},
      product =
        Object.entries(metadata).find(
          ([k]) => k.replace(/[^a-zA-Z]/g, '') === 'courseName',
        )?.[1] ||
        metadata.planName ||
        '';
    const category =
      categories.get(c.id) || (metadata.analycaUserId ? 'analyca' : '');
    const serviceId =
        category === 'corporate'
          ? null
          : classifyService(category, product, services),
      link = linkMap.get(`charge:${c.id}`),
      proof = proofFor(`univapay:${c.id}`);
    const accounts = analyca.filter(
      (a) =>
        (metadata.analycaUserId && a.userId === metadata.analycaUserId) ||
        (c.subscription_id && a.subscriptionId === c.subscription_id) ||
        a.transactionTokenId === c.transaction_token_id,
    );
    const account = accounts.length === 1 ? accounts[0] : undefined;
    const sameEmail = account?.email
      ? sheets.filter(
          (s) => s.email === email(account.email) && s.aliases.length,
        )
      : [];
    const emailElmeIds = [
      ...new Set(
        sameEmail.flatMap((s) =>
          s.aliases.filter((a) => a.startsWith('elme:')),
        ),
      ),
    ];
    const emailLink =
      emailElmeIds.length === 1 ? sameEmail.flatMap((s) => s.aliases) : [];
    const aliases = [
      ...new Set([
        ...linkAliases(link),
        ...(proof?.aliases || []),
        ...(account ? [`analyca:${account.userId}`, ...emailLink] : []),
      ]),
    ];

    purchases.push({
      id: `charge:${c.id}`,
      aliases,
      name:
        proof?.name || link?.customerName || metadata['univapay-name'] || '',
      realName: proof?.realName || metadata['univapay-name'] || '',
      accounts: proof?.accounts || [],
      lineName: proof?.lineName || link?.lineName || account?.lineName || '',
      serviceId,
      date: jstDay(c.created_on),
      dateBasis: '決済日（購入日の代用）',
      amount: c.charged_amount,
      amountKind: 'payment',
      acquisition: !['backend_renewal', 'backend_performance'].includes(
        category,
      ),
      source: 'UnivaPay',
      issue: link?.status === 'conflict' ? '顧客IDの対応が競合' : undefined,
    });
  }
  for (const m of manual) {
    const link = linkMap.get(`manual:${m.id}`),
      proof = proofFor(`moneyforward:${m.id.replace(/^mf_/, '')}`);

    purchases.push({
      id: `manual:${m.id}`,
      aliases: [...new Set([...linkAliases(link), ...(proof?.aliases || [])])],
      name: proof?.name || link?.customerName || m.customerName || '',
      realName: proof?.realName || '',
      accounts: proof?.accounts || [],
      lineName: proof?.lineName || link?.lineName || '',
      serviceId:
        m.category === 'corporate'
          ? null
          : classifyService(m.category, '', services),
      date: date(m.transactionDate),
      dateBasis: '売上に登録された購入日',
      amount: m.amount,
      amountKind: 'payment',
      acquisition: !['backend_renewal', 'backend_performance'].includes(
        m.category,
      ),
      source: '手動・銀行売上',
      issue: link?.status === 'conflict' ? '顧客IDの対応が競合' : undefined,
    });
  }
  for (const s of sheets) {
    const purchase: Purchase = {
      id: s.id,
      aliases: s.aliases,
      name: s.name,
      realName: s.realName,
      accounts: s.accounts,
      lineName: s.lineName,
      serviceId: s.serviceId,
      date: s.date,
      dateBasis: s.dateBasis,
      amount: s.amount,
      amountKind: s.amountKind,
      acquisition: s.acquisition,
      source: s.source,
      sourceUrl: s.sourceUrl,
      roster: s.roster,
      closingStatus: s.closingStatus,
      membership: s.membership,
    };
    purchases.push(purchase);
  }
  return {
    purchases,
    services,
    loadedAt: now,
    sheetSnapshotAt: sheetResult.snapshotAt,
    warnings,
    complete: warnings.length === 0,
  };
}
