import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCustomers,
  buildCustomerRoster,
  frontendOverview,
  funnelCustomers,
  funnelOverview,
  purchasedInFunnel,
  backendOnly,
  firstPurchaseDate,
  sortFunnelCustomers,
  conversionReport,
  classifyService,
  validateServices,
  DEFAULT_SERVICES,
  type Purchase,
} from './model';
const p = (
  id: string,
  serviceId: string,
  date: string | null,
  aliases = ['elme:1'],
): Purchase => ({
  id,
  serviceId,
  date,
  aliases,
  name: '同名のお客様',
  dateBasis: '検証',
  amount: 100000,
  amountKind: 'payment',
  acquisition: true,
  source: 'test',
});
test('stable IDs link multiple services and payments without matching by name', () => {
  const customers = buildCustomers([
    p('a', 'frontend', '2026-01-01'),
    p('b', 'backend', '2026-02-01'),
    p('c', 'frontend', '2026-01-02', []),
    p('d', 'frontend', '2026-01-02', []),
  ]);
  assert.equal(customers.length, 3);
  assert.equal(customers.filter((c) => c.confirmed).length, 1);
  assert.equal(customers.find((c) => c.confirmed)?.serviceIds.length, 2);
});
test('cross-month conversion uses the original buyer cohort, and installments count one person', () => {
  const c = buildCustomers([
    p('a', 'frontend', '2026-01-20'),
    p('b', 'frontend', '2026-02-20'),
    p('c', 'backend', '2026-02-10'),
  ]);
  const report = conversionReport(c, 'frontend', 'backend', 60, '2026-04-01');
  assert.equal(report.eligible, 1);
  assert.equal(report.rate, 100);
  assert.equal(report.cohorts[0].month, '2026-01');
});
test('reverse purchases, unknown dates and same-day unknown order are excluded', () => {
  for (const [a, b] of [
    ['2026-02-01', '2026-01-01'],
    ['2026-01-01', '2026-01-01'],
    [null, '2026-01-01'],
  ] as [string | null, string | null][]) {
    const r = conversionReport(
      buildCustomers([p('a', 'frontend', a), p('b', 'backend', b)]),
      'frontend',
      'backend',
      30,
      '2026-05-01',
    );
    assert.equal(r.rate, null);
    assert.equal(r.excluded, 1);
  }
});
test('immature cohorts are not mixed into completed-window conversion rate', () => {
  const r = conversionReport(
    buildCustomers([
      p('a', 'frontend', '2026-04-01'),
      p('b', 'backend', '2026-04-02'),
    ]),
    'frontend',
    'backend',
    30,
    '2026-04-10',
  );
  assert.equal(r.observing, 1);
  assert.equal(r.eligible, 0);
  assert.equal(r.rate, null);
});
test('conflicting stable identities never enter conversion metrics', () => {
  const c = buildCustomers([
    p('a', 'frontend', '2026-01-01', ['elme:1', 'lstep:1']),
    p('b', 'backend', '2026-01-20', ['elme:2', 'lstep:1']),
  ]);
  assert.equal(c[0].confirmed, false);
  assert.equal(
    conversionReport(c, 'frontend', 'backend', 30, '2026-03-01').eligible,
    0,
  );
});
test('renewal-only backend history cannot establish initial acquisition date', () => {
  const c = buildCustomers([
    p('a', 'frontend', '2026-01-01'),
    { ...p('b', 'backend', '2026-02-01'), acquisition: false },
  ]);
  assert.equal(
    conversionReport(c, 'frontend', 'backend', 60, '2026-04-01').members[0]
      .status,
    'date_unknown',
  );
});
test('new services are classified by exact product metadata and reject ambiguous mappings', () => {
  const s = validateServices([
    ...DEFAULT_SERVICES,
    { id: 'new_course', name: '新講座', categories: [], products: ['新商品'] },
  ]);
  assert.equal(classifyService('other', '新商品', s), 'new_course');
  assert.equal(classifyService('other', '別の商品', s), null);
  assert.throws(() =>
    validateServices([
      ...s,
      {
        id: 'duplicate',
        name: '別の講座',
        categories: [],
        products: ['新商品'],
      },
    ]),
  );
});
test('contract rows do not inflate collected revenue', () => {
  const c = buildCustomers([
    p('a', 'backend', '2026-01-01'),
    { ...p('b', 'backend', '2026-01-01'), amountKind: 'contract' },
  ]);
  assert.equal(c[0].paidAmount, 100000);
});

test('member roster keeps one row per person and omits unlinked transactions and corporate revenue', () => {
  const rows = [
    { ...p('member', 'frontend', '2026-01-01'), roster: true },
    p('installment', 'frontend', '2026-02-01'),
    p('unlinked', 'frontend', '2026-01-01', []),
    {
      ...p('corporate', 'corporate', '2026-01-01', ['company:1']),
      serviceId: null,
    },
  ];
  const c = buildCustomerRoster(rows);
  assert.equal(c.length, 1);
  assert.equal(c[0].purchases.length, 2);
});
test('legacy members merge only by unique exact name AND LINE name across services', () => {
  const a = {
    ...p('front', 'frontend', '2026-01-01', []),
    roster: true,
    lineName: 'LINE名',
  };
  const b = {
    ...p('back', 'backend', '2026-02-01', []),
    roster: true,
    lineName: 'LINE名',
  };
  assert.equal(buildCustomerRoster([a, b]).length, 1);
  assert.equal(
    buildCustomerRoster([a, { ...b, lineName: '別のLINE名' }]).length,
    2,
  );
  assert.equal(
    buildCustomerRoster([a, { ...a, id: 'duplicate' }, b]).length,
    3,
  );
});
test('included members remain visible without being counted as frontend purchases or conversions', () => {
  const c = buildCustomerRoster([
    {
      ...p('included', 'frontend', null),
      roster: true,
      acquisition: false,
      membership: 'registered',
    },
    { ...p('backend', 'backend', '2026-01-01'), roster: true },
  ]);
  const r = frontendOverview(c, '2026-11-10');
  assert.equal(r.front.length, 1);
  assert.equal(r.registered, 1);
  assert.equal(r.frontPurchased.length, 0);
  assert.equal(r.both.length, 0);
  assert.equal(r.rate, null);
});
test('overview separates owning both services from forward cumulative conversion', () => {
  const c = buildCustomerRoster([
    { ...p('front1', 'frontend', '2026-01-01', ['elme:1']), roster: true },
    p('back1', 'backend', '2026-05-01', ['elme:1']),
    { ...p('front2', 'frontend', '2026-05-01', ['elme:2']), roster: true },
    p('back2', 'backend', '2026-01-01', ['elme:2']),
    { ...p('front3', 'frontend', '2026-01-01', ['elme:3']), roster: true },
    { ...p('front4', 'frontend', null, ['elme:4']), roster: true },
  ]);
  const r = frontendOverview(c, '2026-11-10');
  assert.equal(r.front.length, 4);
  assert.equal(r.both.length, 2);
  assert.equal(r.eligible, 2);
  assert.equal(r.converted, 1);
  assert.equal(r.rate, 50);
  assert.equal(r.excluded, 2);
});
test('identified new service purchases can extend the customer roster', () => {
  const c = buildCustomerRoster([
    p('future', 'new_course', '2026-11-01', ['customer:123']),
  ]);
  assert.equal(c.length, 1);
  assert.deepEqual(c[0].serviceIds, ['new_course']);
});

test('funnel starts inclusively on Nov 1, excludes earlier buyers, renewals and unrelated products', () => {
  const c = buildCustomerRoster([
    { ...p('old', 'backend', '2025-10-31', ['elme:old']), roster: true },
    p('old-installment', 'backend', '2026-01-01', ['elme:old']),
    { ...p('start', 'backend', '2025-11-01', ['elme:start']), roster: true },
    {
      ...p('renewal', 'backend', '2026-01-01', ['elme:renewal']),
      roster: true,
      acquisition: false,
    },
    { ...p('analyca', 'analyca', '2026-01-01', ['analyca:1']), roster: true },
    { ...p('future', 'backend', '2027-01-01', ['elme:future']), roster: true },
  ]);
  assert.deepEqual(
    funnelCustomers(c, '2026-11-10').map((c) => c.id),
    ['elme:start'],
  );
});
test('undated frontend buyers stay in launch cohort with unknown dates; undated backend does not imply a period', () => {
  const c = buildCustomerRoster([
    { ...p('front', 'frontend', null, ['elme:front']), roster: true },
    { ...p('back', 'backend', null, ['elme:back']), roster: true },
  ]);
  const scoped = funnelCustomers(c, '2026-11-10');
  assert.equal(scoped.length, 1);
  assert.equal(scoped[0].id, 'elme:front');
  assert.equal(firstPurchaseDate(scoped[0], 'frontend'), null);
  assert.equal(funnelOverview(scoped, '2026-11-10').rate, null);
});
test('old backend history is retained to exclude reverse purchases without increasing period backend counts', () => {
  const c = buildCustomerRoster([
    { ...p('old-back', 'backend', '2025-01-01'), roster: true },
    { ...p('new-front', 'frontend', '2026-01-01'), roster: true },
  ]);
  const scoped = funnelCustomers(c, '2026-11-10'),
    r = funnelOverview(scoped, '2026-11-10');
  assert.equal(scoped.length, 1);
  assert.equal(r.front.length, 1);
  assert.equal(r.backend.length, 0);
  assert.equal(r.backendOnly.length, 0);
  assert.equal(r.eligible, 0);
  assert.equal(r.excluded, 1);
});
test('backend-only means a period backend purchase with no frontend purchase, including registered-only front invitations', () => {
  const c = buildCustomerRoster([
    { ...p('back', 'backend', '2026-01-01'), roster: true },
    {
      ...p('invited', 'frontend', null),
      roster: true,
      membership: 'registered',
      acquisition: false,
    },
  ])[0];
  assert.equal(backendOnly(c, '2026-11-10'), true);
  assert.equal(purchasedInFunnel(c, 'frontend', '2026-11-10'), false);
});
test('sort works both directions for each purchase date and always keeps unknown dates last', () => {
  const c = buildCustomerRoster([
    { ...p('a', 'frontend', '2025-11-01', ['elme:a']), roster: true },
    { ...p('b', 'frontend', '2026-01-01', ['elme:b']), roster: true },
    { ...p('c', 'frontend', null, ['elme:c']), roster: true },
  ]);
  for (const column of ['purchase', 'frontend'] as const) {
    assert.deepEqual(
      sortFunnelCustomers(c, column, 'asc', '2026-11-10').map((c) => c.id),
      ['elme:a', 'elme:b', 'elme:c'],
    );
    assert.deepEqual(
      sortFunnelCustomers(c, column, 'desc', '2026-11-10').map((c) => c.id),
      ['elme:b', 'elme:a', 'elme:c'],
    );
  }
  const backend = buildCustomerRoster(
    c.flatMap((c) => c.purchases).map((p) => ({ ...p, serviceId: 'backend' })),
  );
  assert.deepEqual(
    sortFunnelCustomers(backend, 'backend', 'desc', '2026-11-10').map(
      (c) => c.id,
    ),
    ['elme:b', 'elme:a', 'elme:c'],
  );
});
test('initial period purchase sorting does not use a historical backend date', () => {
  const c = buildCustomerRoster([
    { ...p('old-back', 'backend', '2020-01-01', ['elme:a']), roster: true },
    { ...p('front', 'frontend', '2026-02-01', ['elme:a']), roster: true },
    { ...p('back', 'backend', '2026-01-01', ['elme:b']), roster: true },
  ]);
  assert.deepEqual(
    sortFunnelCustomers(c, 'purchase', 'asc', '2026-11-10').map((c) => c.id),
    ['elme:b', 'elme:a'],
  );
});
test('legal-name field is preferred over nicknames and accounts remain separate', () => {
  const account = { platform: 'SNS', name: 'カレン', id: '@example' };
  const c = buildCustomers([
    { ...p('charge', 'frontend', '2026-01-01'), name: 'カレン' },
    {
      ...p('member', 'frontend', '2026-01-01'),
      roster: true,
      realName: '顧客氏名',
      accounts: [account],
    },
  ])[0];
  assert.equal(c.name, '顧客氏名');
  assert.deepEqual(c.accounts, [account]);
  const unknown = buildCustomers([
    {
      ...p('unknown', 'frontend', '2026-01-01'),
      name: 'カレン',
      lineName: 'カレン',
      accounts: [account],
    },
  ])[0];
  assert.equal(unknown.name, '氏名未確認');
  assert.equal(unknown.accounts[0].name, 'カレン');
});
