/** Run with: node --env-file=.env.local --import tsx src/scripts/reconcileSalesCustomerIds.ts <private-audit-dir> [--apply] */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createBigQueryClient, resolveProjectId } from '../lib/bigquery';
import { getChargesFromBigQuery } from '../lib/sales/charges';
import { getChargeCategories, getManualSales } from '../lib/sales/categories';
import { readElmeIdentities } from '../lib/sales/elmeIdentities';
import { getTransactionContact } from '../lib/univapay/client';
import { getPaymentTags, getSalesCustomerLinks, saveCustomerLinks } from '../lib/sales/customerLinks';
import { IDENTITY_CATEGORIES, matchSalesCustomer, mergeCustomerLink, parseGuardianIdentities } from '../lib/sales/customerIdentity';

async function main() {
  const directory = process.argv[2];
  if (!directory || directory.startsWith('--')) throw new Error('Private audit directory required');
  const read = (file: string) => JSON.parse(readFileSync(join(directory, file), 'utf8'));
  const write = (file: string, value: unknown) => writeFileSync(join(directory, file), JSON.stringify(value, null, 2), { mode: 0o600 });
  const guardian = [
    ...parseGuardianIdentities(read('guardianFront.json').values, 'Threads×AIマスター講座メンバーリスト'),
    ...parseGuardianIdentities(read('guardianBack.json').values, 'SNSマーケ講座メンバーリスト'),
  ];
  const now = new Date().toISOString();
  const client = createBigQueryClient();
  const fingerprint = async () => Object.fromEntries(await Promise.all([
    'charges', 'manual_sales', 'manual_sale_splits', 'charge_categories', 'transaction_groups', 'transaction_group_items', 'customer_profiles',
  ].map(async table => {
    const [rows] = await client.query({ query: `SELECT TO_JSON_STRING(t) value FROM \`${resolveProjectId()}.autostudio_sales.${table}\` t` });
    return [table, { count: rows.length, sha256: createHash('sha256').update(rows.map(row => row.value).sort().join('\n')).digest('hex') }];
  })));
  const before = await fingerprint();
  const [charges, manual, forms, tags, saved] = await Promise.all([
    getChargesFromBigQuery('2020-01-01T00:00:00+09:00', now),
    getManualSales('2020-01-01', new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10)),
    readElmeIdentities(), getPaymentTags(), getSalesCustomerLinks(),
  ]);
  const categories = await getChargeCategories(charges.map(row => row.id));
  const categoryFor = (charge: typeof charges[number]) => {
    const metadata = charge.metadata ?? {};
    const course = metadata.courseName ?? Object.entries(metadata).find(([key]) => key.replace(/[^a-zA-Z]/g, '') === 'courseName')?.[1];
    return categories.get(charge.id) ?? (metadata.analycaUserId ? 'analyca' : course === 'Threads×AI運用マスター講座' ? 'frontend' : 'other');
  };
  const courses = charges.filter(row => row.status === 'successful' && IDENTITY_CATEGORIES.has(categoryFor(row)));
  const contactPath = join(directory, 'customer-link-contacts.json');
  const contacts: Record<string, { email: string; name: string }> = existsSync(contactPath) ? JSON.parse(readFileSync(contactPath, 'utf8')) : {};
  const missingTokens = [...new Set(courses.map(row => row.transaction_token_id).filter(id => id && !contacts[id]))];
  const failures: string[] = [];
  for (let i = 0; i < missingTokens.length; i += 5) {
    await Promise.all(missingTokens.slice(i, i + 5).map(async id => {
      try { contacts[id] = await getTransactionContact(id); } catch { failures.push(id); }
    }));
    write('customer-link-contacts.json', contacts);
  }
  const savedMap = new Map(saved.map(row => [row.revenueKey, row]));
  const inputs = [
    ...courses.map(row => ({ revenueKey: `charge:${row.id}`, email: contacts[row.transaction_token_id]?.email ?? '',
      elmeId: savedMap.get(`charge:${row.id}`)?.elmeId, paymentMethod: 'card' })),
    ...manual.filter(row => IDENTITY_CATEGORIES.has(row.category)).map(row => ({ revenueKey: `manual:${row.id}`,
      email: row.note.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? '',
      elmeId: savedMap.get(`manual:${row.id}`)?.elmeId, paymentMethod: row.paymentMethod })),
  ];
  const links = inputs.map(input => mergeCustomerLink(savedMap.get(input.revenueKey), matchSalesCustomer(input, forms, guardian, tags, now)));
  assert.equal(new Set(links.map(row => row.revenueKey)).size, links.length);
  // The preview includes all source records used in financial aggregates, not just matched sales.
  const totals = () => {
    const rows = [
      ...charges.filter(row => row.status === 'successful').map(row => ({ key: `charge:${row.id}`, amount: row.charged_amount, category: categoryFor(row),
        saleDate: new Date(Date.parse(row.created_on) + 9 * 3600000).toISOString().slice(0, 10), paymentDate: new Date(Date.parse(row.created_on) + 9 * 3600000).toISOString().slice(0, 10) })),
      ...manual.map(row => ({ key: `manual:${row.id}`, amount: row.amount, category: row.category, saleDate: row.transactionDate, paymentDate: row.paymentDate ?? '' })),
    ];
    const group = (key: 'category' | 'saleDate' | 'paymentDate') => rows.reduce<Record<string, number>>((out, row) => { out[row[key]] = (out[row[key]] ?? 0) + row.amount; return out; }, {});
    return { count: rows.length, amount: rows.reduce((sum, row) => sum + row.amount, 0), byCategory: group('category'), bySaleDate: group('saleDate'), byPaymentDate: group('paymentDate') };
  };
  const preview = { generatedAt: now, sources: { guardianRows: guardian.length, formRows: forms.length, paymentSnapshots: [...new Set(tags.map(row => row.snapshotDate))] },
    sourceFingerprint: before, totals: totals(), contactFailures: failures, links };
  write('customer-link-preview.json', preview);
  const counts = { eligible: links.length, confirmed: links.filter(row => row.status === 'confirmed').length,
    lstep: links.filter(row => row.lstepId).length, conflict: links.filter(row => row.status === 'conflict').length,
    pending: links.filter(row => row.status === 'pending').length };
  assert.deepEqual(await fingerprint(), before, 'Source data changed during preview; rerun before applying');
  if (process.argv.includes('--apply')) {
    await saveCustomerLinks(links);
    const after = await fingerprint();
    assert.deepEqual(after, before, 'Financial source data changed; inspect audit before further work');
    const persisted = await getSalesCustomerLinks();
    for (const link of links) assert.deepEqual(persisted.find(row => row.revenueKey === link.revenueKey), JSON.parse(JSON.stringify(link)));
    write('customer-link-verification.json', { verifiedAt: new Date().toISOString(), counts, before, after, totals: totals(), persisted: links.length });
  }
  console.log(JSON.stringify({ ...counts, applied: process.argv.includes('--apply'), contactFailures: failures.length, totals: { count: preview.totals.count, amount: preview.totals.amount } }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
