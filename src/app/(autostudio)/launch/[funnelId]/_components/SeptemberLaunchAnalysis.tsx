'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';

import { dashboardCardClass } from '@/components/dashboard/styles';
import { classNames } from '@/lib/classNames';
import type {
  SeptemberLaunchAnalysisPerson,
  SeptemberLaunchAnalysisResponse,
} from '@/types/launch';

interface SeptemberLaunchAnalysisProps {
  funnelId: string;
}

interface DistributionItem {
  label: string;
  count: number;
  rate: number;
}

const MEASUREMENT_DATES = [
  '2026-08-28',
  '2026-08-29',
  '2026-08-30',
  '2026-08-31',
  '2026-09-01',
  '2026-09-02',
  '2026-09-03',
  '2026-09-04',
  '2026-09-05',
  '2026-09-06',
  '2026-09-07',
] as const;

const SEMINAR_DAYS = [
  { date: '2026-09-02', label: '9/2', weekday: '水' },
  { date: '2026-09-04', label: '9/4', weekday: '金' },
  { date: '2026-09-05', label: '9/5', weekday: '土' },
  { date: '2026-09-06', label: '9/6', weekday: '日' },
  { date: '2026-09-07', label: '9/7', weekday: '月' },
] as const;

const ATTRIBUTE_ORDERS = {
  age: ['20代', '30代', '40代', '50代', '60代', '未回答', '複数設定'],
  gender: ['男性', '女性', '未回答', '複数設定'],
  job: ['会社員', 'フリーランス', '経営者', '主婦', '学生', '未回答', '複数設定'],
  revenue: [
    '0円',
    '1〜10万円',
    '10〜50万円',
    '50〜100万円',
    '100〜500万円',
    '500〜1000万円',
    '1000万円以上',
    '未回答',
    '複数設定',
  ],
} as const;

const numberFormatter = new Intl.NumberFormat('ja-JP');
const percentFormatter = new Intl.NumberFormat('ja-JP', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const fetcher = async (url: string): Promise<SeptemberLaunchAnalysisResponse> => {
  const response = await fetch(url, { cache: 'no-store' });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error ?? '分析データの取得に失敗しました');
  return json as SeptemberLaunchAnalysisResponse;
};

function formatShortDate(date: string): string {
  const [, month, day] = date.split('-').map(Number);
  return `${month}/${day}`;
}

function formatDateTime(value: string): string {
  const [date, time] = value.split(' ');
  return `${formatShortDate(date)} ${time ?? ''}`.trim();
}

function formatSnapshotDate(value: string): string {
  if (!value) return '—';
  const [year, month, day] = value.split('-').map(Number);
  return `${year}/${month}/${day}`;
}

function defaultSeminarDate(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  const today = `${value('year')}-${value('month')}-${value('day')}`;
  return SEMINAR_DAYS.find((day) => day.date >= today)?.date ?? SEMINAR_DAYS.at(-1)!.date;
}

function buildDistribution(
  people: SeptemberLaunchAnalysisPerson[],
  key: 'age' | 'gender' | 'job' | 'revenue',
): DistributionItem[] {
  const counts = new Map<string, number>();
  for (const person of people) counts.set(person[key], (counts.get(person[key]) ?? 0) + 1);

  const order = ATTRIBUTE_ORDERS[key];
  const ordered = order.map((label) => ({
    label,
    count: counts.get(label) ?? 0,
    rate: people.length > 0 ? ((counts.get(label) ?? 0) / people.length) * 100 : 0,
  }));
  const extra = Array.from(counts.entries())
    .filter(([label]) => !order.includes(label as never))
    .map(([label, count]) => ({
      label,
      count,
      rate: people.length > 0 ? (count / people.length) * 100 : 0,
    }));

  return [...ordered, ...extra].filter(
    (item) => item.count > 0 || item.label === '未回答' || item.label === '複数設定',
  );
}

function buildSourceDistribution(people: SeptemberLaunchAnalysisPerson[]): DistributionItem[] {
  const counts = new Map<string, number>();
  for (const person of people) {
    const values = Array.from(new Set([...person.sourceMedia, ...person.sourceRoutes]));
    if (values.length === 0) counts.set('未設定', (counts.get('未設定') ?? 0) + 1);
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({
      label,
      count,
      rate: people.length > 0 ? (count / people.length) * 100 : 0,
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'ja'));
}

function summarizeTopItems(items: DistributionItem[]): DistributionItem | null {
  const answered = items.filter((item) =>
    item.label !== '未回答' && item.label !== '複数設定' && item.label !== '未設定',
  );
  const maxCount = Math.max(0, ...answered.map((item) => item.count));
  if (maxCount === 0) return null;
  const tied = answered.filter((item) => item.count === maxCount);
  return {
    label: tied.map((item) => item.label).join('・'),
    count: maxCount,
    rate: tied[0].rate,
  };
}

export function SeptemberLaunchAnalysis({ funnelId }: SeptemberLaunchAnalysisProps) {
  const { data, error, isLoading } = useSWR<SeptemberLaunchAnalysisResponse>(
    `/api/launch/analysis/${funnelId}?segmentDefinition=friend-added-at&view=seminar-brief`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 300_000 },
  );
  const [seminarDate, setSeminarDate] = useState(defaultSeminarDate);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const allPeople = useMemo(() => data?.people ?? [], [data?.people]);
  const seminarPeople = useMemo(
    () => allPeople.filter((person) => person.seminarDate === seminarDate),
    [allPeople, seminarDate],
  );
  const distributions = useMemo(() => ({
    age: buildDistribution(seminarPeople, 'age'),
    gender: buildDistribution(seminarPeople, 'gender'),
    job: buildDistribution(seminarPeople, 'job'),
    revenue: buildDistribution(seminarPeople, 'revenue'),
    source: buildSourceDistribution(seminarPeople),
  }), [seminarPeople]);
  const dailyApplications = useMemo(() => MEASUREMENT_DATES.map((date) => {
    const people = allPeople.filter((person) => person.applicationDate === date);
    return {
      date,
      applications: people.length,
      newCount: people.filter((person) => person.segment === 'new').length,
      existingCount: people.filter((person) => person.segment === 'existing').length,
      attendanceCount: people.filter((person) => person.attended).length,
      frontendCount: people.filter((person) => person.frontendPurchased).length,
    };
  }), [allPeople]);

  const attendedCount = seminarPeople.filter((person) => person.attended).length;
  const frontendCount = seminarPeople.filter((person) => person.frontendPurchased).length;
  const newCount = seminarPeople.filter((person) => person.segment === 'new').length;
  const existingCount = seminarPeople.length - newCount;
  const unknownCount = seminarPeople.filter((person) =>
    [person.age, person.gender, person.job, person.revenue].some((value) => value === '未回答'),
  ).length;
  const multiTaggedCount = seminarPeople.filter((person) =>
    [person.age, person.gender, person.job, person.revenue].some((value) => value === '複数設定'),
  ).length;

  const searchedPeople = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('ja');
    if (!keyword) return seminarPeople;
    return seminarPeople.filter((person) => [
      person.displayName,
      person.age,
      person.gender,
      person.job,
      person.revenue,
      ...person.sourceMedia,
      ...person.sourceRoutes,
    ].some((value) => value.toLocaleLowerCase('ja').includes(keyword)));
  }, [search, seminarPeople]);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(searchedPeople.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedPeople = searchedPeople.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedDay = SEMINAR_DAYS.find((day) => day.date === seminarDate) ?? SEMINAR_DAYS[0];

  if (isLoading) return <AnalysisLoading />;
  if (error || !data) {
    return (
      <div className={dashboardCardClass} role="alert">
        <p className="text-sm font-semibold text-[color:var(--color-error)]">参加予定者データを読み込めませんでした</p>
        <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
          {error instanceof Error ? error.message : '時間を置いて、もう一度「分析」を開いてください。'}
        </p>
      </div>
    );
  }

  const selectDay = (date: string) => {
    setSeminarDate(date);
    setSearch('');
    setPage(1);
  };

  return (
    <div className="section-stack min-w-0 [&>*]:min-w-0">
      <SeminarDaySelector rows={SEMINAR_DAYS} selectedDate={seminarDate} onSelect={selectDay} />

      <section className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold tabular-nums text-[color:var(--color-text-primary)]">{selectedDay.label}（{selectedDay.weekday}）</h2>
        <div className="flex items-center gap-2 text-xs text-[color:var(--color-text-muted)]">
          <span className="inline-flex h-2 w-2 rounded-full bg-[color:var(--color-success)]" aria-hidden="true" />
          <span>データ基準 {formatSnapshotDate(data.snapshotDate)} CSV</span>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="参加予定" value={seminarPeople.length} unit="人" detail="申込者" accent />
        <MetricCard
          label="実参加"
          value={attendedCount}
          unit="人"
          detail={`参加率 ${seminarPeople.length > 0 ? percentFormatter.format((attendedCount / seminarPeople.length) * 100) : '0.0'}%`}
        />
        <MetricCard
          label="FE購入"
          value={frontendCount}
          unit="人"
          detail={`申込→FE ${seminarPeople.length > 0 ? percentFormatter.format((frontendCount / seminarPeople.length) * 100) : '0.0'}%`}
        />
        <MetricCard label="新規 / 既存" value={`${newCount} / ${existingCount}`} unit="人" detail="" />
      </section>

      <ParticipantPortrait people={seminarPeople} distributions={distributions} />

      {seminarPeople.length > 0 ? (
        <section>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-sm font-semibold text-[color:var(--color-text-primary)]">{selectedDay.label} 参加予定者の属性</h2>
            {unknownCount > 0 || multiTaggedCount > 0 ? (
              <p className="text-xs text-[color:var(--color-warning)]">未回答 {unknownCount}人・複数設定 {multiTaggedCount}人</p>
            ) : null}
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            <DistributionCard title="年代" items={distributions.age} denominator={seminarPeople.length} />
            <DistributionCard title="職業" items={distributions.job} denominator={seminarPeople.length} />
            <DistributionCard title="月商" items={distributions.revenue} denominator={seminarPeople.length} />
            <DistributionCard title="性別" items={distributions.gender} denominator={seminarPeople.length} />
          </div>
        </section>
      ) : (
        <section className={classNames(dashboardCardClass, 'py-12 text-center')}>
          <p className="text-sm font-semibold text-[color:var(--color-text-primary)]">{selectedDay.label}の参加予定者はまだいません</p>
          <p className="mt-2 text-xs text-[color:var(--color-text-muted)]">申込が入ると表示されます。</p>
        </section>
      )}

      {seminarPeople.length > 0 ? (
        <DistributionCard
          title="流入媒体・経路"
          description="媒体と詳細経路は重複します。"
          items={distributions.source}
          denominator={seminarPeople.length}
          columns
        />
      ) : null}

      <PeopleTable
        dateLabel={selectedDay.label}
        people={pagedPeople}
        total={searchedPeople.length}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        page={safePage}
        totalPages={totalPages}
        onPage={setPage}
      />

      <ApplicationTrendDisclosure rows={dailyApplications} />

      {data.dataQuality.excludedApplications > 0 ? (
        <p className="text-xs text-[color:var(--color-text-muted)]">
          参考: 9月セミナー申込日の登録 {data.dataQuality.registeredApplications}人のうち、申込日時が計測期間外または不明の {data.dataQuality.excludedApplications}人は対象外です。
        </p>
      ) : null}
    </div>
  );
}

function SeminarDaySelector({
  rows,
  selectedDate,
  onSelect,
}: {
  rows: ReadonlyArray<{
    date: string;
    label: string;
    weekday: string;
  }>;
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  return (
    <section className={dashboardCardClass}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {rows.map((row) => {
          const active = row.date === selectedDate;
          return (
            <button
              key={row.date}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(row.date)}
              className={classNames(
                'min-w-0 rounded-[var(--radius-md)] border px-4 py-3 text-left transition-colors',
                active
                  ? 'border-[color:var(--color-accent)] bg-[color:var(--color-accent-muted)] shadow-sm'
                  : 'border-[color:var(--color-border)] bg-white hover:border-[color:var(--color-accent)]',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-bold tabular-nums text-[color:var(--color-text-primary)]">{row.label}</span>
                <span className="text-[11px] font-medium text-[color:var(--color-text-muted)]">{row.weekday}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function MetricCard({
  label,
  value,
  unit,
  detail,
  accent = false,
}: {
  label: string;
  value: number | string;
  unit: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className={classNames(dashboardCardClass, 'min-w-0', accent ? 'border-l-4 border-l-[color:var(--color-accent)]' : '')}>
      <p className="truncate text-xs font-semibold text-[color:var(--color-text-muted)]">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-[color:var(--color-text-primary)] sm:text-3xl">
        {typeof value === 'number' ? numberFormatter.format(value) : value}<span className="ml-1 text-xs font-medium text-[color:var(--color-text-muted)]">{unit}</span>
      </p>
      {detail ? <p className="mt-1 truncate text-[11px] text-[color:var(--color-text-muted)]">{detail}</p> : null}
    </div>
  );
}

function ParticipantPortrait({
  people,
  distributions,
}: {
  people: SeptemberLaunchAnalysisPerson[];
  distributions: {
    age: DistributionItem[];
    job: DistributionItem[];
    revenue: DistributionItem[];
    source: DistributionItem[];
  };
}) {
  const newCount = people.filter((person) => person.segment === 'new').length;
  const existingCount = people.length - newCount;
  const facts = [
    { label: '年代', item: summarizeTopItems(distributions.age) },
    { label: '職業', item: summarizeTopItems(distributions.job) },
    { label: '月商', item: summarizeTopItems(distributions.revenue) },
    { label: '主な流入', item: summarizeTopItems(distributions.source) },
  ];
  const [age, job, revenue, source] = facts.map(({ item }) => item?.label ?? 'データなし');
  const summary = `参加予定者${people.length}人は、新規${newCount}人・既存${existingCount}人。年代は${age}、職業は${job}が多く、月商は${revenue}が中心です。主な流入は${source}です。`;
  return (
    <section className={dashboardCardClass}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[color:var(--color-text-primary)]">参加予定者の概要</h2>
        <span className="text-[11px] text-[color:var(--color-text-muted)]">母数 {people.length}人</span>
      </div>
      <p className="mt-3 rounded-[var(--radius-sm)] bg-[color:var(--color-accent-muted)] px-4 py-3 text-sm font-medium leading-6 text-[color:var(--color-text-primary)]">
        {summary}
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {facts.map(({ label, item }) => (
          <div key={label} className="min-w-0 rounded-[var(--radius-sm)] bg-[color:var(--color-surface-muted)] p-3">
            <span className="text-xs text-[color:var(--color-text-muted)]">{label}</span>
            <strong className="mt-1 block truncate text-sm text-[color:var(--color-text-primary)]">{item?.label ?? 'データなし'}</strong>
            <span className="mt-1 block text-xs tabular-nums text-[color:var(--color-text-secondary)]">
              {item ? `${item.count}人 / ${percentFormatter.format(item.rate)}%` : '—'}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function DistributionCard({
  title,
  description,
  items,
  denominator,
  columns = false,
}: {
  title: string;
  description?: string;
  items: DistributionItem[];
  denominator: number;
  columns?: boolean;
}) {
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <section className={dashboardCardClass}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)]">{title}</h3>
          {description ? <p className="mt-1 text-[11px] text-[color:var(--color-text-muted)]">{description}</p> : null}
        </div>
        <span className="whitespace-nowrap text-[11px] text-[color:var(--color-text-muted)]">母数 {denominator}人</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-5 text-xs text-[color:var(--color-text-muted)]">表示できるデータがありません。</p>
      ) : (
        <div className={classNames('mt-4 grid gap-x-6 gap-y-3', columns ? 'md:grid-cols-2' : '')}>
          {items.map((item) => (
            <div key={item.label} className="grid grid-cols-[minmax(88px,0.8fr)_minmax(120px,2fr)_64px] items-center gap-3">
              <span className="truncate text-xs font-medium text-[color:var(--color-text-secondary)]" title={item.label}>{item.label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-[#eef1f4]">
                <div
                  className={classNames(
                    'h-full rounded-full',
                    item.label === '未回答' || item.label === '未設定'
                      ? 'bg-[#b6bbc2]'
                      : item.label === '複数設定'
                        ? 'bg-[color:var(--color-warning)]'
                        : 'bg-[color:var(--color-accent)]',
                  )}
                  style={{ width: `${item.count > 0 ? Math.max(4, (item.count / max) * 100) : 0}%` }}
                />
              </div>
              <span className="text-right text-xs tabular-nums text-[color:var(--color-text-secondary)]">
                <strong className="text-[color:var(--color-text-primary)]">{item.count}</strong>
                <span className="ml-1 text-[10px]">{percentFormatter.format(item.rate)}%</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PeopleTable({
  dateLabel,
  people,
  total,
  search,
  onSearch,
  page,
  totalPages,
  onPage,
}: {
  dateLabel: string;
  people: SeptemberLaunchAnalysisPerson[];
  total: number;
  search: string;
  onSearch: (value: string) => void;
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
}) {
  return (
    <section className={dashboardCardClass}>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--color-text-primary)]">{dateLabel} 参加予定者一覧</h2>
          <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">{total}人</p>
        </div>
        <label className="sm:w-64">
          <span className="sr-only">表示名・属性で検索</span>
          <input
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="表示名・属性で検索"
            className="h-9 w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-white px-3 text-xs text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-muted)]"
          />
        </label>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-xs text-[color:var(--color-text-muted)]">
              <th className="px-3 py-2 text-left font-medium">LINE名</th>
              <th className="px-3 py-2 text-left font-medium">区分</th>
              <th className="px-3 py-2 text-left font-medium">申込日時</th>
              <th className="px-3 py-2 text-left font-medium">年代 / 性別</th>
              <th className="px-3 py-2 text-left font-medium">職業</th>
              <th className="px-3 py-2 text-left font-medium">月商</th>
              <th className="px-3 py-2 text-left font-medium">流入</th>
              <th className="px-3 py-2 text-left font-medium">進捗</th>
            </tr>
          </thead>
          <tbody>
            {people.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-xs text-[color:var(--color-text-muted)]">該当者がいません。</td></tr>
            ) : people.map((person) => {
              const sources = Array.from(new Set([...person.sourceMedia, ...person.sourceRoutes]));
              return (
                <tr key={person.userId} className="border-b border-[color:var(--color-border)] last:border-0">
                  <td className="max-w-52 truncate px-3 py-3 font-semibold text-[color:var(--color-text-primary)]" title={person.displayName}>{person.displayName}</td>
                  <td className="px-3 py-3">
                    <span className={classNames(
                      'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      person.segment === 'new'
                        ? 'bg-[color:var(--color-accent-muted)] text-[color:var(--color-accent-dark)]'
                        : 'bg-[#eef1f4] text-[color:var(--color-text-secondary)]',
                    )}>{person.segment === 'new' ? '新規' : '既存'}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums">{formatDateTime(person.applicationAt)}</td>
                  <td className="whitespace-nowrap px-3 py-3">{person.age} / {person.gender}</td>
                  <td className="whitespace-nowrap px-3 py-3">{person.job}</td>
                  <td className="whitespace-nowrap px-3 py-3">{person.revenue}</td>
                  <td className="max-w-64 px-3 py-3 text-xs text-[color:var(--color-text-secondary)]">{sources.length > 0 ? sources.join(' / ') : '未設定'}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <span className="rounded bg-[#eef1f4] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--color-text-secondary)]">申込</span>
                      {person.attended ? <span className="rounded bg-[#e8f8f1] px-1.5 py-0.5 text-[10px] font-semibold text-[#087a50]">参加</span> : null}
                      {person.frontendPurchased ? <span className="rounded bg-[color:var(--color-accent-muted)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--color-accent-dark)]">FE購入</span> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-3">
          <button type="button" disabled={page <= 1} onClick={() => onPage(Math.max(1, page - 1))} className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40">前へ</button>
          <span className="text-xs tabular-nums text-[color:var(--color-text-muted)]">{page} / {totalPages}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => onPage(Math.min(totalPages, page + 1))} className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40">次へ</button>
        </div>
      ) : null}
    </section>
  );
}

function ApplicationTrendDisclosure({
  rows,
}: {
  rows: Array<{
    date: string;
    applications: number;
    newCount: number;
    existingCount: number;
    attendanceCount: number;
    frontendCount: number;
  }>;
}) {
  return (
    <details className={dashboardCardClass}>
      <summary className="cursor-pointer list-none text-sm font-semibold text-[color:var(--color-text-primary)]">
        <span className="flex items-center justify-between gap-3">
          <span>集客推移（申込日別）</span>
          <span className="text-xs font-medium text-[color:var(--color-text-muted)]">補足データを開く</span>
        </span>
      </summary>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-xs text-[color:var(--color-text-muted)]">
              <th className="px-3 py-2 text-left font-medium">申込日</th>
              <th className="px-3 py-2 text-right font-medium">当日申込</th>
              <th className="px-3 py-2 text-right font-medium">新規</th>
              <th className="px-3 py-2 text-right font-medium">既存</th>
              <th className="px-3 py-2 text-right font-medium">参加</th>
              <th className="px-3 py-2 text-right font-medium">参加率</th>
              <th className="px-3 py-2 text-right font-medium">FE購入</th>
              <th className="px-3 py-2 text-right font-medium">申込→FE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.date} className="border-b border-[color:var(--color-border)] last:border-0">
                <td className="px-3 py-3 font-semibold text-[color:var(--color-text-primary)]">{formatShortDate(row.date)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{row.applications}</td>
                <td className="px-3 py-3 text-right tabular-nums">{row.newCount}</td>
                <td className="px-3 py-3 text-right tabular-nums">{row.existingCount}</td>
                <td className="px-3 py-3 text-right tabular-nums">{row.attendanceCount}</td>
                <td className="px-3 py-3 text-right tabular-nums text-[color:var(--color-text-secondary)]">{row.applications > 0 ? `${percentFormatter.format((row.attendanceCount / row.applications) * 100)}%` : '—'}</td>
                <td className="px-3 py-3 text-right tabular-nums">{row.frontendCount}</td>
                <td className="px-3 py-3 text-right tabular-nums text-[color:var(--color-text-secondary)]">{row.applications > 0 ? `${percentFormatter.format((row.frontendCount / row.applications) * 100)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function AnalysisLoading() {
  return (
    <div className="section-stack min-w-0" aria-busy="true" aria-live="polite">
      <div className="h-48 animate-pulse rounded-[var(--radius-md)] bg-[#e8eaed]" />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <div key={index} className="h-28 animate-pulse rounded-[var(--radius-md)] bg-[#e8eaed]" />)}
      </div>
      <div className="h-64 animate-pulse rounded-[var(--radius-md)] bg-[#e8eaed]" />
      <span className="sr-only">参加予定者データを読み込み中</span>
    </div>
  );
}
