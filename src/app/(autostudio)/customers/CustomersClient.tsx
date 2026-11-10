'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FollowupEditor } from './FollowupEditor';
import {
  OFFER_LABELS,
  PROSPECT_LABELS,
  closingRecord,
  needsOfferReview,
} from '@/lib/customers/followup';
import {
  buildCustomerRoster,
  funnelCustomers,
  funnelOverview,
  purchasedInFunnel,
  firstPurchaseDate,
  backendOnly,
  sortFunnelCustomers,
  FUNNEL_SERVICES,
  FUNNEL_START,
  hasPurchased,
  conversionReport,
  type CustomerSort,
  type Customer,
  type CustomerDataset,
  type ConversionStatus,
  type ServiceDefinition,
} from '@/lib/customers/model';

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`;
const pct = (n: number | null) => (n === null ? '—' : `${n.toFixed(1)}%`);
const input =
  'rounded-lg border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm outline-none focus:border-[color:var(--color-accent)]';
const button =
  'rounded-lg border border-[color:var(--color-border)] bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-40';
const primary =
  'rounded-lg bg-[color:var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40';
const panel =
  'rounded-xl border border-[color:var(--color-border)] bg-white p-5 md:p-6';
const statuses: Record<ConversionStatus, string> = {
  converted: '転換済み',
  not_converted: '期間内の転換なし',
  observing: '集計途中',
  prior_target: '移行先を先に購入',
  date_unknown: '購入日・順序を要確認',
};
const colors = [
  'bg-blue-50 text-blue-700 border-blue-100',
  'bg-violet-50 text-violet-700 border-violet-100',
  'bg-emerald-50 text-emerald-700 border-emerald-100',
  'bg-amber-50 text-amber-700 border-amber-100',
];
function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className={panel}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-xs text-gray-500">{detail}</p>
    </div>
  );
}
function AccountDetails({ customer }: { customer: Customer }) {
  const accounts = customer.accounts.filter(
    (a) => a.platform === 'SNS' || a.platform === 'LINE',
  );
  return (
    <div className="space-y-1 text-xs text-gray-500">
      {!accounts.some((a) => a.platform === 'SNS') && (
        <p className="text-gray-400">SNS：シート未登録</p>
      )}
      {accounts.map((a, i) => (
        <div key={`${a.platform}:${i}`}>
          <span className="mr-1 text-gray-400">{a.platform}</span>
          {a.url ? (
            <a
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="text-[color:var(--color-accent)] hover:underline"
            >
              {a.name || a.id || 'プロフィール'}
            </a>
          ) : (
            <span>{a.name || a.id || '—'}</span>
          )}
          {a.id && a.id !== a.name && (
            <p className="break-all text-gray-400">{a.id}</p>
          )}
        </div>
      ))}
    </div>
  );
}
export function CustomersClient() {
  const [tab, setTab] = useState<'list' | 'conversion' | 'services'>('list');
  const [data, setData] = useState<CustomerDataset | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(''),
    [service, setService] = useState('frontend'),
    [page, setPage] = useState(0);
  const [sort, setSort] = useState<CustomerSort>('frontend'),
    [direction, setDirection] = useState<'asc' | 'desc'>('asc');
  const [followupFilter, setFollowupFilter] = useState('all');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [source, setSource] = useState('frontend'),
    [target, setTarget] = useState('backend'),
    [days, setDays] = useState(60),
    [cohort, setCohort] = useState('all'),
    [resultFilter, setResultFilter] = useState('all');
  const [editingService, setEditingService] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState(''),
    [product, setProduct] = useState(''),
    [category, setCategory] = useState(''),
    [saving, setSaving] = useState(false),
    [saveMessage, setSaveMessage] = useState('');
  async function reload() {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/customers/dashboard', { cache: 'no-store' });
      if (!r.ok) throw Error('顧客データを読み込めませんでした。');
      const d: CustomerDataset = await r.json();
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : '取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload();
    const params = new URLSearchParams(window.location.search);
    const s = params.get('service');
    if (
      s &&
      ['frontend', 'backend', 'both', 'backend-only', 'all'].includes(s)
    ) {
      setService(s);
      setSort(
        s === 'frontend'
          ? 'frontend'
          : s === 'backend' || s === 'backend-only'
            ? 'backend'
            : 'purchase',
      );
    }
    if (params.get('tab') === 'conversion') setTab('conversion');
  }, []);
  const allCustomers = useMemo(
    () => buildCustomerRoster(data?.purchases || []),
    [data],
  );
  const services = data?.services || [];
  const serviceLabel = (id: string | null) =>
    services.find((s) => s.id === id)?.name || 'サービス未分類';
  const badge = (id: string) => (
    <span
      key={id}
      className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${
        colors[
          Math.max(
            0,
            services.findIndex((s) => s.id === id),
          ) % colors.length
        ]
      }`}
    >
      {serviceLabel(id)}
    </span>
  );
  const rosterPurchaseIds = new Set(
    allCustomers.flatMap((c) => c.purchases.map((p) => p.id)),
  );
  const unlinked = (data?.purchases || []).filter(
    (p) =>
      p.serviceId &&
      FUNNEL_SERVICES.includes(p.serviceId) &&
      p.date &&
      p.date >= FUNNEL_START &&
      !rosterPurchaseIds.has(p.id),
  );
  const cutoff = data?.sheetSnapshotAt || data?.loadedAt;
  const asOf = cutoff
    ? new Date(Date.parse(cutoff) + 9 * 3600e3).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const customers = useMemo(
    () => funnelCustomers(allCustomers, asOf),
    [allCustomers, asOf],
  );
  const confirmed = customers.filter((c) => c.confirmed);
  const funnelServices = services.filter((s) => FUNNEL_SERVICES.includes(s.id));
  const report = useMemo(
    () =>
      conversionReport(
        customers.filter((c) => purchasedInFunnel(c, source, asOf)),
        source,
        target,
        days,
        asOf,
      ),
    [customers, source, target, days, asOf],
  );
  const overview = useMemo(
    () => funnelOverview(customers, asOf),
    [customers, asOf],
  );
  const visible = sortFunnelCustomers(
    customers.filter(
      (c) =>
        (service === 'all' ||
          (service === 'backend-only'
            ? backendOnly(c, asOf)
            : service === 'both'
              ? purchasedInFunnel(c, 'frontend', asOf) &&
                purchasedInFunnel(c, 'backend', asOf)
              : purchasedInFunnel(c, service, asOf))) &&
        (followupFilter === 'all' ||
          (followupFilter === 'check'
            ? needsOfferReview(c, data?.followups?.[c.id])
            : followupFilter === 'no_prospect'
              ? data?.followups?.[c.id]?.prospect === 'none' ||
                ((!data?.followups?.[c.id]?.prospect ||
                  data.followups[c.id].prospect === 'unknown') &&
                  closingRecord(c, data?.followups?.[c.id]).code === 'none')
              : data?.followups?.[c.id]?.offer === followupFilter)) &&
        `${c.name} ${c.lineName} ${c.id} ${c.accounts.map((a) => `${a.name || ''} ${a.id || ''}`).join(' ')}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    ),
    sort,
    direction,
    asOf,
  );
  const cohortMembers = report.members.filter(
    (m) => cohort === 'all' || m.sourceDate?.startsWith(cohort),
  );
  const cohortEligible = cohortMembers.filter((m) =>
      ['converted', 'not_converted'].includes(m.status),
    ),
    cohortConverted = cohortEligible.filter(
      (m) => m.status === 'converted',
    ).length;
  const conversionRate =
    data?.complete && cohortEligible.length
      ? (cohortConverted / cohortEligible.length) * 100
      : null;
  const memberRows = cohortMembers.filter(
    (m) => resultFilter === 'all' || m.status === resultFilter,
  );
  useEffect(() => {
    setPage(0);
  }, [search, service, sort, direction, followupFilter]);
  function selectService(id: string) {
    setService(id);
    setSort(
      id === 'frontend'
        ? 'frontend'
        : id === 'backend' || id === 'backend-only'
          ? 'backend'
          : 'purchase',
    );
  }
  function editService(s: ServiceDefinition) {
    setEditingService(s.id);
    setServiceName(s.name);
    setProduct(s.products.join('\n'));
    setCategory(s.categories[0] || '');
    setSaveMessage('');
  }
  function clearServiceForm() {
    setEditingService(null);
    setServiceName('');
    setProduct('');
    setCategory('');
  }
  async function addService(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMessage('');
    try {
      const current = services.find((s) => s.id === editingService);
      const next: ServiceDefinition = {
        id: editingService || `service_${crypto.randomUUID().slice(0, 8)}`,
        name: serviceName.trim(),
        categories:
          current && ['frontend', 'backend', 'analyca'].includes(current.id)
            ? current.categories
            : category
              ? [category]
              : [],
        products: product
          .split('\n')
          .map((p) => p.trim())
          .filter(Boolean),
      };
      const r = await fetch('/api/customers/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          services: editingService
            ? services.map((s) => (s.id === editingService ? next : s))
            : [...services, next],
        }),
      });
      const body = await r.json();
      if (!r.ok) throw Error(body.error || '保存できませんでした');
      clearServiceForm();
      setSaveMessage('サービスを保存しました。');
      await reload();
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : '保存できませんでした');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="section-stack text-[color:var(--color-text-primary)]">
      <div className="flex items-center justify-between gap-4 overflow-x-auto border-b border-[color:var(--color-border)]">
        <h1 className="sr-only">Customers</h1>
        <nav aria-label="顧客タブ" className="flex shrink-0 items-center gap-6">
          {(
            [
              ['list', '顧客一覧'],
              ['conversion', '転換率'],
              ['services', 'サービス設定'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => {
                setTab(id);
                setSelected(null);
              }}
              aria-current={tab === id ? 'page' : undefined}
              className={`inline-flex h-12 items-center whitespace-nowrap border-b-2 px-1 text-sm font-medium ${tab === id ? 'border-[color:var(--color-accent)] text-[color:var(--color-accent)]' : 'border-transparent text-gray-500'}`}
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-3">
          <Link
            href="/sales"
            className="inline-flex h-10 items-center text-sm text-gray-500 hover:underline"
          >
            Sales
          </Link>
          <button
            onClick={() => void reload()}
            disabled={loading}
            className={`${button} h-10 whitespace-nowrap`}
          >
            {loading ? '読込中…' : '再読み込み'}
          </button>
        </div>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}{' '}
          <button className="underline" onClick={() => void reload()}>
            再試行
          </button>
        </div>
      )}
      {!!data?.warnings.length && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <p className="font-semibold">
            一部のデータを取得できていません。転換率は表示を保留しています。
          </p>
          {data.warnings.map((w) => (
            <p key={w} className="mt-1">
              {w}
            </p>
          ))}
        </div>
      )}

      {loading && !data ? (
        <div
          className={`${panel} py-20 text-center text-sm text-gray-500`}
          role="status"
        >
          購入履歴と顧客IDを照合しています…
        </div>
      ) : (
        data && (
          <>
            {tab === 'list' && (
              <>
                <section className={panel}>
                  <div className="grid gap-6 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-gray-500">フロント購入者</p>
                      <button
                        onClick={() => selectService('frontend')}
                        className="mt-2 text-3xl font-semibold tabular-nums hover:underline"
                      >
                        {overview.front.length}
                        <span className="ml-1 text-sm font-normal">人</span>
                      </button>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">バック購入者</p>
                      <button
                        onClick={() => selectService('backend')}
                        className="mt-2 text-3xl font-semibold tabular-nums hover:underline"
                      >
                        {overview.backend.length}
                        <span className="ml-1 text-sm font-normal">人</span>
                      </button>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">
                        フロント → バック転換率
                      </p>
                      <p className="mt-2 text-3xl font-semibold tabular-nums">
                        {pct(data.complete ? overview.rate : null)}
                      </p>
                      <details className="mt-2 text-xs text-gray-500">
                        <summary className="cursor-pointer">集計内訳</summary>
                        <p className="mt-2 leading-6">
                          購入順序・日付を確認できた{overview.eligible}人中
                          {overview.converted}人。逆順・日付未確認など
                          {overview.excluded}人は集計対象外。
                        </p>
                        <button
                          className="mt-2 text-[color:var(--color-accent)] hover:underline"
                          onClick={() => setTab('conversion')}
                        >
                          月別・期間別を見る
                        </button>
                      </details>
                    </div>
                  </div>
                </section>
                <section className={panel}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="font-semibold">顧客一覧</h2>
                    <input
                      aria-label="顧客検索"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="氏名・アカウント名・IDで検索"
                      className={`${input} w-full sm:w-64`}
                    />
                  </div>
                  <div
                    className="mt-4 flex items-center gap-4 overflow-x-auto pb-1"
                    role="group"
                    aria-label="顧客一覧の絞り込みと並び替え"
                  >
                    <div className="flex shrink-0 items-center gap-2">
                      {[
                        ...funnelServices,
                        { id: 'both', name: 'フロント・バック両方' },
                        { id: 'backend-only', name: 'バックのみ' },
                        { id: 'all', name: 'すべて' },
                      ].map((s) => (
                        <button
                          key={s.id}
                          aria-pressed={service === s.id}
                          onClick={() => selectService(s.id)}
                          className={`inline-flex h-10 items-center whitespace-nowrap rounded-full border px-4 text-xs font-medium ${service === s.id ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50'}`}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-3 text-xs text-gray-500">
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        相談対応
                        <select
                          aria-label="相談対応の絞り込み"
                          className={`${input} h-10 w-44`}
                          value={followupFilter}
                          onChange={(e) => setFollowupFilter(e.target.value)}
                        >
                          <option value="all">すべて</option>
                          <option value="check">提案状況を確認したい</option>
                          <option value="not_offered">
                            未提案（記録済み）
                          </option>
                          <option value="offered">提案済み</option>
                          <option value="no_prospect">見込みなし</option>
                        </select>
                      </label>
                      <label className="flex items-center gap-2 whitespace-nowrap">
                        並び順
                        <select
                          aria-label="並び替え項目"
                          value={sort}
                          onChange={(e) =>
                            setSort(e.target.value as CustomerSort)
                          }
                          className={`${input} h-10 w-36`}
                        >
                          <option value="purchase">初回購入日</option>
                          <option value="frontend">フロント購入日</option>
                          <option value="backend">バック購入日</option>
                          <option value="name">氏名</option>
                        </select>
                      </label>
                      <select
                        aria-label="並び替え方向"
                        value={direction}
                        onChange={(e) =>
                          setDirection(e.target.value as 'asc' | 'desc')
                        }
                        className={`${input} h-10 w-24`}
                      >
                        <option value="asc">
                          {sort === 'name' ? '昇順' : '古い順'}
                        </option>
                        <option value="desc">
                          {sort === 'name' ? '降順' : '新しい順'}
                        </option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-y border-gray-100 bg-gray-50 text-xs text-gray-500">
                        <tr>
                          <th className="min-w-36 px-3 py-3 font-medium">
                            氏名
                          </th>
                          <th className="min-w-48 px-3 py-3 font-medium">
                            SNS・LINEアカウント
                          </th>
                          {funnelServices.map((s) => (
                            <th className="px-3 py-3 font-medium" key={s.id}>
                              {s.name}購入日
                            </th>
                          ))}
                          <th className="px-3 py-3 font-medium">購入区分</th>
                          <th className="min-w-32 px-3 py-3 font-medium">
                            相談提案・見込み度
                          </th>
                          <th className="min-w-32 px-3 py-3 font-medium">
                            クロージング記録
                          </th>
                          <th className="px-3 py-3" />
                        </tr>
                      </thead>
                      <tbody>
                        {visible.slice(page * 50, (page + 1) * 50).map((c) => (
                          <tr
                            key={c.id}
                            className="border-b border-gray-100 hover:bg-gray-50/70"
                          >
                            <td className="px-3 py-4">
                              <button
                                onClick={() => setSelected(c)}
                                className={`text-left font-medium hover:underline ${c.name === '氏名未確認' ? 'text-gray-400' : ''}`}
                              >
                                {c.name}
                              </button>
                            </td>
                            <td className="px-3 py-4">
                              <AccountDetails customer={c} />
                            </td>
                            {funnelServices.map((s) => {
                              const purchased = purchasedInFunnel(
                                c,
                                s.id,
                                asOf,
                              );
                              const date = firstPurchaseDate(c, s.id);
                              return (
                                <td key={s.id} className="px-3 py-4">
                                  <span
                                    className={`inline-flex rounded-md px-2 py-1 text-xs ${
                                      purchased
                                        ? colors[
                                            Math.max(
                                              0,
                                              services.findIndex(
                                                (x) => x.id === s.id,
                                              ),
                                            ) % colors.length
                                          ]
                                        : 'text-gray-400'
                                    }`}
                                  >
                                    {purchased
                                      ? date || '購入済み・日付未確認'
                                      : date && date < FUNNEL_START
                                        ? '対象期間前'
                                        : !date && hasPurchased(c, s.id)
                                          ? '購入済み・日付未確認'
                                          : '—'}
                                  </span>
                                </td>
                              );
                            })}
                            <td className="px-3 py-4 text-xs text-gray-500">
                              {backendOnly(c, asOf)
                                ? 'バックのみ'
                                : purchasedInFunnel(c, 'frontend', asOf) &&
                                    purchasedInFunnel(c, 'backend', asOf)
                                  ? 'フロント・バック両方'
                                  : hasPurchased(c, 'backend')
                                    ? 'バック購入歴あり'
                                    : 'フロントのみ'}
                            </td>
                            <td className="px-3 py-4 text-xs">
                              <button
                                onClick={() => setSelected(c)}
                                className="text-left hover:underline"
                              >
                                <p className="text-[color:var(--color-accent)]">
                                  {
                                    OFFER_LABELS[
                                      data.followups?.[c.id]?.offer || 'unknown'
                                    ]
                                  }
                                </p>
                                <p className="mt-1 text-gray-500">
                                  見込み：
                                  {
                                    PROSPECT_LABELS[
                                      data.followups?.[c.id]?.prospect ||
                                        'unknown'
                                    ]
                                  }
                                </p>
                                {data.followups?.[c.id]?.offeredDate && (
                                  <p className="mt-1 text-gray-400">
                                    {data.followups[c.id].offeredDate}
                                  </p>
                                )}
                              </button>
                            </td>
                            <td className="px-3 py-4 text-xs text-gray-500">
                              <button
                                onClick={() => setSelected(c)}
                                className="text-left hover:underline"
                              >
                                {closingRecord(c, data.followups?.[c.id]).label}
                              </button>
                            </td>
                            <td className="px-3 py-4">
                              <button
                                className="whitespace-nowrap text-xs text-[color:var(--color-accent)]"
                                onClick={() => setSelected(c)}
                                aria-label={`${c.name}の相談・クロージングを管理`}
                              >
                                管理
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!visible.length && (
                      <p className="py-12 text-center text-sm text-gray-500">
                        条件に一致する顧客はいません。
                      </p>
                    )}
                  </div>
                  <div className="mt-4 flex items-center justify-end gap-2 text-xs text-gray-500">
                    <span className="mr-auto">日付未確認は末尾に表示</span>
                    <button
                      className={button}
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      前へ
                    </button>
                    <span>
                      {page + 1} / {Math.max(1, Math.ceil(visible.length / 50))}
                    </span>
                    <button
                      className={button}
                      disabled={(page + 1) * 50 >= visible.length}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      次へ
                    </button>
                  </div>
                </section>
              </>
            )}
            {tab === 'conversion' && (
              <>
                <section className={panel}>
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="text-xs text-gray-500">
                      購入元サービス
                      <select
                        aria-label="購入元サービス"
                        value={source}
                        onChange={(e) => {
                          setSource(e.target.value);
                          if (e.target.value === target)
                            setTarget(
                              funnelServices.find(
                                (s) => s.id !== e.target.value,
                              )?.id || '',
                            );
                          setCohort('all');
                        }}
                        className={`${input} mt-1 block`}
                      >
                        {funnelServices.map((s) => (
                          <option value={s.id} key={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="pb-2 text-gray-400">→</span>
                    <label className="text-xs text-gray-500">
                      移行先サービス
                      <select
                        aria-label="移行先サービス"
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                        className={`${input} mt-1 block`}
                      >
                        {funnelServices
                          .filter((s) => s.id !== source)
                          .map((s) => (
                            <option value={s.id} key={s.id}>
                              {s.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="text-xs text-gray-500">
                      購入後の期間
                      <select
                        aria-label="転換の計測期間"
                        value={days}
                        onChange={(e) => setDays(Number(e.target.value))}
                        className={`${input} mt-1 block`}
                      >
                        {[30, 60, 90].map((d) => (
                          <option key={d} value={d}>
                            {d}日以内
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-gray-500">
                      購入元の初回購入月
                      <select
                        aria-label="初回購入月"
                        className={`${input} mt-1 block`}
                        value={cohort}
                        onChange={(e) => setCohort(e.target.value)}
                      >
                        <option value="all">2025年11月以降</option>
                        {report.cohorts.map((c) => (
                          <option key={c.month}>{c.month}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className="mt-4 text-xs leading-6 text-gray-500">
                    初回購入から{days}
                    日経過した、本人の紐付け・購入日が確認できる顧客が対象です。移行先を先に買った人と同日で順序が不明な人は除外。分割入金・継続入金は人数を増やしません。決済日を購入日の代わりに使う履歴が含まれます。
                  </p>
                </section>
                <p className="text-xs text-gray-500">
                  顧客に紐付いていない{serviceLabel(source)}の決済・入金明細：
                  {unlinked.filter((p) => p.serviceId === source).length}
                  件。顧客の人数には加算していません。
                </p>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Stat
                    label={`${days}日以内の転換率`}
                    value={pct(conversionRate)}
                    detail={
                      data.complete
                        ? '確認できた顧客の範囲で算出'
                        : 'データ取得が未完了のため保留'
                    }
                  />
                  <Stat
                    label="転換した顧客"
                    value={`${cohortConverted}人`}
                    detail={`集計対象 ${cohortEligible.length}人のうち`}
                  />
                  <Stat
                    label="集計途中"
                    value={`${cohortMembers.filter((m) => m.status === 'observing').length}人`}
                    detail={`初回購入から${days}日未満`}
                  />
                  <Stat
                    label="順序・日付による除外"
                    value={`${cohortMembers.filter((m) => ['date_unknown', 'prior_target'].includes(m.status)).length}人`}
                    detail="逆順の購入・購入日未確認など"
                  />
                </div>
                <section className={panel}>
                  <h2 className="font-semibold">購入月ごとの転換</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    月を選ぶと対象の顧客を下に表示します。未照合の決済明細は人数に加算しません。
                  </p>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-y bg-gray-50 text-xs text-gray-500">
                        <tr>
                          {[
                            '初回購入月',
                            '集計対象',
                            '転換',
                            '転換率',
                            '集計途中',
                            '除外',
                          ].map((x) => (
                            <th key={x} className="px-3 py-3 font-medium">
                              {x}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {report.cohorts.map((c) => (
                          <tr
                            key={c.month}
                            className={`border-b border-gray-100 ${cohort === c.month ? 'bg-blue-50/50' : ''}`}
                          >
                            <td className="px-3 py-3">
                              <button
                                className="font-medium text-[color:var(--color-accent)]"
                                onClick={() => setCohort(c.month)}
                              >
                                {c.month}
                              </button>
                            </td>
                            <td className="px-3 py-3">{c.eligible}人</td>
                            <td className="px-3 py-3">{c.converted}人</td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-3">
                                <span className="w-14 tabular-nums">
                                  {pct(data.complete ? c.rate : null)}
                                </span>
                                <div className="h-1.5 w-20 overflow-hidden rounded bg-gray-100">
                                  <div
                                    className="h-full bg-[color:var(--color-accent)]"
                                    style={{
                                      width: `${data.complete ? c.rate || 0 : 0}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3">{c.observing}人</td>
                            <td className="px-3 py-3">{c.excluded}人</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!report.cohorts.length && (
                      <p className="py-10 text-center text-gray-500">
                        集計できる初回購入日がありません。
                      </p>
                    )}
                  </div>
                </section>
                <section className={panel}>
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold">
                      対象の顧客（2025年11月以降）
                    </h2>
                    <select
                      aria-label="転換結果"
                      className={input}
                      value={resultFilter}
                      onChange={(e) => setResultFilter(e.target.value)}
                    >
                      <option value="all">すべての結果</option>
                      {Object.entries(statuses).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-y bg-gray-50 text-xs text-gray-500">
                        <tr>
                          {[
                            '顧客',
                            '購入元の初回日',
                            '移行先の初回日',
                            '結果',
                          ].map((x) => (
                            <th key={x} className="px-3 py-3 font-medium">
                              {x}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {memberRows.map((m) => (
                          <tr
                            className="border-b border-gray-100"
                            key={m.customer.id}
                          >
                            <td className="px-3 py-3">
                              <button
                                className="font-medium hover:underline"
                                onClick={() => setSelected(m.customer)}
                              >
                                {m.customer.name}
                              </button>
                            </td>
                            <td className="px-3 py-3">
                              {m.sourceDate || '未確認'}
                            </td>
                            <td className="px-3 py-3">
                              {m.targetDate || '未確認・未購入'}
                            </td>
                            <td className="px-3 py-3">
                              <span
                                className={
                                  m.status === 'converted'
                                    ? 'text-emerald-700'
                                    : 'text-gray-500'
                                }
                              >
                                {statuses[m.status]}
                              </span>
                              {m.days !== null && m.days >= 0 && (
                                <span className="ml-2 text-xs text-gray-400">
                                  {m.days}日後
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!memberRows.length && (
                      <p className="py-10 text-center text-gray-500">
                        条件に一致する顧客はいません。
                      </p>
                    )}
                  </div>
                </section>
              </>
            )}
            {tab === 'services' && (
              <>
                <section className={panel}>
                  <h2 className="font-semibold">集計するサービス</h2>
                  <p className="mt-1 text-sm text-gray-500">
                    サービス名と決済商品の対応を管理します。現在の集計対象はフロントエンド・バックエンドです。
                  </p>
                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    {services.map((s) => (
                      <div
                        key={s.id}
                        className="rounded-lg border border-gray-200 p-4"
                      >
                        {badge(s.id)}
                        <p className="mt-3 text-2xl font-semibold">
                          {
                            confirmed.filter((c) => hasPurchased(c, s.id))
                              .length
                          }
                          <span className="ml-1 text-sm font-normal text-gray-500">
                            人
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          確認済み購入者
                        </p>
                        <p className="mt-4 break-words text-xs leading-5 text-gray-500">
                          {s.products.length
                            ? `商品名：${s.products.join('、')}`
                            : s.categories.length
                              ? '既存の売上分類に接続済み'
                              : '購入データとの接続は未設定'}
                        </p>
                        <button
                          type="button"
                          className={`${button} mt-4`}
                          onClick={() => editService(s)}
                          aria-label={`${s.name}の設定を編集`}
                        >
                          編集
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
                <form onSubmit={addService} className={panel}>
                  <h2 className="font-semibold">
                    {editingService ? 'サービスを編集' : 'サービスを追加'}
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    商品名を指定すると、同じ名称の決済をこのサービスとして表示します。
                  </p>
                  <div className="mt-5 grid gap-4 md:grid-cols-3">
                    <label className="text-sm">
                      サービス名
                      <input
                        aria-label="サービス名"
                        required
                        maxLength={80}
                        value={serviceName}
                        onChange={(e) => setServiceName(e.target.value)}
                        placeholder="例：新しい講座"
                        className={`${input} mt-2 block w-full`}
                      />
                    </label>
                    <label className="text-sm">
                      決済に登録されている商品名
                      <textarea
                        aria-label="決済の商品名"
                        rows={3}
                        maxLength={2000}
                        value={product}
                        onChange={(e) => setProduct(e.target.value)}
                        placeholder="1行に1商品名。未販売なら後から設定"
                        className={`${input} mt-2 block w-full`}
                      />
                    </label>
                    <label className="text-sm">
                      既存の売上分類
                      <select
                        aria-label="既存の売上分類"
                        value={category}
                        disabled={
                          !!editingService &&
                          ['frontend', 'backend', 'analyca'].includes(
                            editingService,
                          )
                        }
                        onChange={(e) => setCategory(e.target.value)}
                        className={`${input} mt-2 block w-full`}
                      >
                        <option value="">使用しない</option>
                        {[
                          ['frontend', 'フロントエンド'],
                          ['backend', 'バックエンド'],
                          ['analyca', 'ANALYCA'],
                          ['other', 'その他'],
                        ]
                          .filter(
                            ([id]) =>
                              !services.some(
                                (s) =>
                                  s.id !== editingService &&
                                  s.categories.includes(id),
                              ),
                          )
                          .map(([id, name]) => (
                            <option key={id} value={id}>
                              {name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <div className="mt-5 flex items-center gap-4">
                    <button
                      disabled={saving || !serviceName.trim()}
                      className={primary}
                    >
                      {saving
                        ? '保存中…'
                        : editingService
                          ? '変更を保存'
                          : 'サービスを追加'}
                    </button>
                    {editingService && (
                      <button
                        type="button"
                        className={button}
                        onClick={clearServiceForm}
                      >
                        キャンセル
                      </button>
                    )}
                    <p role="status" className="text-sm text-gray-600">
                      {saveMessage}
                    </p>
                  </div>
                </form>
              </>
            )}
            <p className="text-xs text-gray-400">
              売上データ：
              {new Date(data.loadedAt).toLocaleString('ja-JP', {
                timeZone: 'Asia/Tokyo',
              })}
              {data.sheetSnapshotAt && (
                <>
                  {' '}
                  · 顧客シート：
                  {new Date(data.sheetSnapshotAt).toLocaleString('ja-JP', {
                    timeZone: 'Asia/Tokyo',
                  })}
                </>
              )}
            </p>
          </>
        )
      )}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/25"
          onClick={() => setSelected(null)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.name}の管理`}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSelected(null);
            }}
            className="h-full w-full max-w-2xl overflow-y-auto bg-white p-6 shadow-xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs text-gray-500">顧客管理</p>
                <h2 className="mt-1 text-xl font-semibold">{selected.name}</h2>
                <div className="mt-3">
                  <AccountDetails customer={selected} />
                </div>
              </div>
              <button
                autoFocus
                className={button}
                onClick={() => setSelected(null)}
              >
                閉じる
              </button>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {selected.serviceIds
                .filter((id) => purchasedInFunnel(selected, id, asOf))
                .map(badge)}
            </div>
            {!selected.confirmed && (
              <p className="mt-4 text-xs text-gray-500">{selected.issue}</p>
            )}
            <FollowupEditor
              key={selected.id}
              customer={selected}
              value={data?.followups?.[selected.id]}
              onSaved={reload}
            />
            <div className="mt-6 space-y-4">
              {selected.purchases
                .filter(
                  (p) =>
                    p.serviceId &&
                    FUNNEL_SERVICES.includes(p.serviceId) &&
                    p.acquisition &&
                    p.membership !== 'registered' &&
                    (!p.date || (p.date >= FUNNEL_START && p.date <= asOf)),
                )
                .map((p) => (
                  <article
                    className="rounded-lg border border-gray-200 p-4"
                    key={p.id}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-medium">
                          {serviceLabel(p.serviceId)}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                          {p.date || '日付未確認'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium tabular-nums">
                          {p.amount === null ? '金額未確認' : yen(p.amount)}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {p.amountKind === 'payment'
                            ? '決済・入金額'
                            : 'シート記載額（入金との合算対象外）'}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-gray-500">
                      {p.dateBasis} · {p.source}
                      {!p.acquisition ? ' · 継続・追加入金' : ''}
                    </p>
                    {p.sourceUrl && (
                      <a
                        href={p.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-xs text-[color:var(--color-accent)]"
                      >
                        元の顧客シートを開く
                      </a>
                    )}
                  </article>
                ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
