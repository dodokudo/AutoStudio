'use client';

import useSWR from 'swr';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { Card } from '@/components/ui/card';

interface PanelItem {
  label: string;
  count: number;
  rate: number;
  missing?: boolean;
}

interface PanelSection {
  title: string;
  items: PanelItem[];
}

interface SummaryStep {
  label: string;
  count: number;
  conversionRate: number | null;
  overallRate: number;
}

interface FunnelReport {
  targetStartDate: string;
  base: number;
  activeBase: number;
  blockedCount: number;
  blockedRate: number;
  surveyCompleted: number;
  seminarApplied: number;
  seminarApplicationRate: number;
  seminarJoined: number;
  seminarJoinRate: number;
  purchased: number;
  purchaseRate: number;
  productLpTapped: number;
  consultTapped: number;
  consultApplied: number;
  consultJoined: number;
}

interface BranchStat {
  label: string;
  count: number;
  baseLabel: string;
  baseCount: number;
  rate: number;
}

interface SeminarSlot {
  key: string;
  date: string;
  time: string;
  applications: number;
  joined: number;
  purchased: number;
  joinRate: number;
  purchaseRate: number;
  rawSlots: string[];
}

interface DemographicItem {
  key: string;
  label: string;
  count: number;
  rate: number;
}

interface DemographicGroup {
  key: string;
  label: string;
  items: DemographicItem[];
}

interface DemographicSegment {
  key: string;
  label: string;
  total: number;
  groups: DemographicGroup[];
}

interface BlockTiming {
  label: string;
  count: number;
  rate: number;
}

interface SourceAnalysis {
  label: string;
  base: number;
  surveyCompleted: number;
  seminarApplied: number;
  seminarApplicationRate: number;
  seminarJoined: number;
  seminarJoinRate: number;
  purchased: number;
  purchaseRate: number;
  blocked: number;
  blockedRate: number;
}

interface StateMapItem {
  key: string;
  label: string;
  count: number;
  next: string;
  alert: number;
  alertLabel: string;
}

interface DailyMovement {
  date: string;
  registered: number;
  answered: number;
  applied: number;
  joined: number;
  purchased: number;
  blocked: number;
}

interface LeadTimeRow {
  key: string;
  label: string;
  buckets: Record<string, number>;
  total: number;
  avgDays: number | null;
}

interface PanelAnalysisResponse {
  snapshotDate: string | null;
  base: number;
  report: FunnelReport;
  leadTime?: LeadTimeRow[];
  stateMap?: StateMapItem[];
  dailyMovements?: DailyMovement[];
  branchStats: BranchStat[];
  seminarSlots: SeminarSlot[];
  demographicSegments: DemographicSegment[];
  blockTiming: BlockTiming[];
  sourceAnalysis: SourceAnalysis[];
  summary: SummaryStep[];
  sections: PanelSection[];
  missingColumns: string[];
  error?: string;
}

const fetcher = async (input: RequestInfo) => {
  const res = await fetch(input.toString());
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'データの取得に失敗しました');
  return json as PanelAnalysisResponse;
};

const numberFormatter = new Intl.NumberFormat('ja-JP');
const percentFormatter = new Intl.NumberFormat('ja-JP', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}

function formatPercent(value: number): string {
  return `${percentFormatter.format(value)}%`;
}

interface PanelAnalysisProps {
  startDate?: string;
  endDate?: string;
}

export function PanelAnalysis({ startDate, endDate }: PanelAnalysisProps) {
  const query = startDate && endDate ? `?start=${startDate}&end=${endDate}` : '';
  const { data, error, isLoading } = useSWR<PanelAnalysisResponse>(`/api/line/panel-analysis${query}`, fetcher, {
    revalidateOnFocus: false,
  });

  if (isLoading) {
    return (
      <Card className="p-5">
        <p className="text-sm text-[color:var(--color-text-secondary)]">ファネルデータを読み込み中...</p>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="p-5">
        <p className="text-sm font-semibold text-red-600">ファネルデータの取得に失敗しました</p>
        <p className="mt-2 text-xs text-[color:var(--color-text-secondary)]">
          {error instanceof Error ? error.message : '不明なエラー'}
        </p>
      </Card>
    );
  }

  const fallbackReport: FunnelReport = {
    targetStartDate: '2026-07-03',
    base: data.base,
    activeBase: data.base,
    blockedCount: 0,
    blockedRate: 0,
    surveyCompleted: data.summary.find((step) => step.label === '回答完了')?.count ?? 0,
    seminarApplied: data.summary.find((step) => step.label === 'セミナー申込')?.count ?? 0,
    seminarApplicationRate: data.summary.find((step) => step.label === 'セミナー申込')?.conversionRate ?? 0,
    seminarJoined: data.summary.find((step) => step.label === 'セミナー参加')?.count ?? 0,
    seminarJoinRate: data.summary.find((step) => step.label === 'セミナー参加')?.conversionRate ?? 0,
    purchased: data.summary.find((step) => step.label === 'フロント購入')?.count ?? 0,
    purchaseRate: 0,
    productLpTapped: data.summary.find((step) => step.label === '商品LPタップ')?.count ?? 0,
    consultTapped: 0,
    consultApplied: 0,
    consultJoined: 0,
  };
  const report = data.report ?? fallbackReport;
  const seminarSlots = data.seminarSlots ?? [];
  const stateMap = data.stateMap ?? [];
  const dailyMovements = data.dailyMovements ?? [];
  const demographicSegments = data.demographicSegments ?? [];
  const blockTiming = data.blockTiming ?? [];
  const sourceAnalysis = data.sourceAnalysis ?? [];
  const leadTime = data.leadTime ?? [];
  const maxBlockTiming = Math.max(...blockTiming.map((item) => item.count), 1);
  const reportCards = [
    { label: '計測対象', value: report.base, sub: `${report.targetStartDate}以降登録` },
    { label: '回答完了', value: report.surveyCompleted, sub: `回答率 ${formatPercent((report.surveyCompleted / Math.max(report.base, 1)) * 100)}` },
    { label: '申込数', value: report.seminarApplied, sub: `申込率 ${formatPercent(report.seminarApplicationRate)}` },
    { label: '参加', value: report.seminarJoined, sub: `参加率 ${formatPercent(report.seminarJoinRate)}` },
    { label: '購入', value: report.purchased, sub: `購入率 ${formatPercent(report.purchaseRate)}` },
    { label: 'ブロック', value: report.blockedCount, sub: `ブロック率 ${formatPercent(report.blockedRate)}` },
  ];
  const notApplied = Math.max(report.surveyCompleted - report.seminarApplied, 0);
  const notAttended = Math.max(report.seminarApplied - report.seminarJoined, 0);
  const notPurchased = Math.max(report.seminarJoined - report.purchased, 0);
  const notAnswered = Math.max(report.base - report.surveyCompleted, 0);
  const consultTargets = notApplied + notAttended + notPurchased;

  const alertNotAttended = stateMap.find((st) => st.key === 'applied_not_attended')?.alert ?? 0;
  const alertNotPurchased = stateMap.find((st) => st.key === 'attended_not_purchased')?.alert ?? 0;

  // ファネル図: ステージ + 各ステージからの離脱（＝回収導線の対象）
  const funnelStages = [
    {
      label: 'LINE登録',
      count: report.base,
      rate: null as number | null,
      drop: {
        label: '未回答',
        count: notAnswered,
        dest: 'アンケート誘導を継続',
        alert: 0,
        alertLabel: '',
      },
    },
    {
      label: '回答完了',
      count: report.surveyCompleted,
      rate: (report.surveyCompleted / Math.max(report.base, 1)) * 100,
      drop: {
        label: 'セミナー申込なし',
        count: notApplied,
        dest: '個別相談誘導 / リマーケ販売',
        alert: 0,
        alertLabel: '',
      },
    },
    {
      label: 'セミナー申込',
      count: report.seminarApplied,
      rate: report.seminarApplicationRate,
      drop: {
        label: 'セミナー未参加',
        count: notAttended,
        dest: '後追い配信（再申込誘導）',
        alert: alertNotAttended,
        alertLabel: '枠日時超過',
      },
    },
    {
      label: 'セミナー参加',
      count: report.seminarJoined,
      rate: report.seminarJoinRate,
      drop: {
        label: '未購入',
        count: notPurchased,
        dest: '24時間追撃 / 個別相談誘導',
        alert: alertNotPurchased,
        alertLabel: '48時間超過',
      },
    },
    {
      label: '購入',
      count: report.purchased,
      rate: report.purchaseRate,
      drop: null,
    },
  ];

  // グラフは古い日付が左に来るように昇順へ（テーブルは新しい順のまま）
  const dailyRegistrationChart = [...dailyMovements]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => ({
      label: day.date.slice(5).replace('-', '/'),
      registered: day.registered,
      blocked: day.blocked,
    }));

  const slotDates = [...new Set(seminarSlots.map((slot) => slot.date))];
  // 開催時刻は固定せず、期間内の実データに出てくる時刻をそのまま列にする
  const slotTimes = [...new Set(seminarSlots.map((slot) => slot.time))].sort(
    (a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10),
  );

  type SlotCounts = { applications: number; joined: number; purchased: number };
  const sumCounts = (slots: Array<SeminarSlot | undefined>): SlotCounts =>
    slots.reduce<SlotCounts>(
      (acc, slot) => ({
        applications: acc.applications + (slot?.applications ?? 0),
        joined: acc.joined + (slot?.joined ?? 0),
        purchased: acc.purchased + (slot?.purchased ?? 0),
      }),
      { applications: 0, joined: 0, purchased: 0 },
    );

  // 数字（申込・参加・購入）を先に並べ、率はその右にまとめる。
  // 数字と率が交互に並ぶと読みにくいため、間には挟まない。
  const renderCounts = (counts: SlotCounts | undefined) => {
    if (!counts || counts.applications === 0) {
      return <span className="text-xs text-[color:var(--color-text-muted)]">-</span>;
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-sm tabular-nums">
        <span className="rounded bg-sky-100 px-2 py-0.5 font-semibold text-sky-800">申 {counts.applications}</span>
        <span className={`rounded px-2 py-0.5 font-semibold ${counts.joined > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>参 {counts.joined}</span>
        <span className={`rounded px-2 py-0.5 font-semibold ${counts.purchased > 0 ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'}`}>購 {counts.purchased}</span>
        <span className="ml-1 text-xs font-medium text-[color:var(--color-text-secondary)]">
          {formatPercent((counts.joined / counts.applications) * 100)}
          <span className="mx-0.5 text-slate-300">/</span>
          {counts.joined > 0 ? formatPercent((counts.purchased / counts.joined) * 100) : '-'}
        </span>
      </span>
    );
  };

  // デモグラのピボット: 属性ごとに 申込 / 参加 / 購入 を横持ちにする
  const segItems = (segKey: string, groupKey: string) =>
    demographicSegments.find((seg) => seg.key === segKey)?.groups.find((g) => g.key === groupKey)?.items ?? [];
  const demoGroupDefs = [
    { key: 'age', label: '年代' },
    { key: 'job', label: '職業' },
    { key: 'revenue', label: '月商' },
    { key: 'goal', label: '目標（月収）' },
    { key: 'source', label: '流入' },
  ];
  const demoPivot = demoGroupDefs
    .map((group) => {
      const labels = new Map<string, { applied: number; joined: number; purchased: number }>();
      const segFields = [
        ['applicants', 'applied'],
        ['attendees', 'joined'],
        ['purchasers', 'purchased'],
      ] as const;
      for (const [segKey, field] of segFields) {
        for (const item of segItems(segKey, group.key)) {
          const entry = labels.get(item.label) ?? { applied: 0, joined: 0, purchased: 0 };
          entry[field] = item.count;
          labels.set(item.label, entry);
        }
      }
      return {
        ...group,
        rows: [...labels.entries()]
          .map(([label, counts]) => ({ label, ...counts }))
          .sort((a, b) => b.applied - a.applied || b.joined - a.joined),
      };
    })
    .filter((group) => group.rows.length > 0);

  const topApplicantProfile = demoPivot
    .map((group) => (group.rows[0] && group.rows[0].applied > 0 ? group.rows[0].label : null))
    .filter(Boolean)
    .join(' × ');
  const purchaserProfile = demoPivot
    .map((group) => group.rows.filter((row) => row.purchased > 0).map((row) => row.label).join('/'))
    .filter((label) => label)
    .join(' × ');

  return (
    <div className="space-y-3">
      <Card className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
            【2026.7】セミナーファネル サマリー
          </h2>
          {data.snapshotDate ? (
            <span className="text-xs text-[color:var(--color-text-muted)]">
              スナップショット: {data.snapshotDate}
            </span>
          ) : null}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {reportCards.map((card) => (
            <div key={card.label} className="rounded border border-[color:var(--color-border)] p-3">
              <div className="text-xs font-medium text-[color:var(--color-text-secondary)]">{card.label}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-[color:var(--color-text-primary)]">
                {formatNumber(card.value)}
              </div>
              <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">{card.sub}</div>
            </div>
          ))}
        </div>


        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)]">ファネルの流れとステップ配信の分岐</h3>
            <span className="text-xs text-[color:var(--color-text-muted)]">上段=前進した人 / 下段=そこで落ちた人と、流れる回収導線</span>
          </div>
          <div className="mt-3 overflow-x-auto pb-1">
            <div className="grid min-w-[960px] grid-cols-[1fr_56px_1fr_56px_1fr_56px_1fr_56px_1fr] items-stretch gap-y-2">
              {funnelStages.map((stage, index) => (
                <div key={stage.label} className="contents">
                  {index > 0 ? (
                    <div className="flex flex-col items-center justify-center px-1">
                      <span className={`text-xs font-semibold tabular-nums ${stage.rate !== null && stage.rate >= 50 ? 'text-emerald-600' : stage.rate !== null && stage.rate >= 20 ? 'text-amber-600' : 'text-red-500'}`}>
                        {stage.rate !== null ? formatPercent(stage.rate) : ''}
                      </span>
                      <span className="text-lg leading-none text-slate-300">→</span>
                    </div>
                  ) : null}
                  <div className={`flex flex-col justify-center rounded-lg border-2 px-3 py-3 text-center ${stage.label === '購入' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-emerald-200 bg-emerald-50'}`}>
                    <div className={`text-xs font-medium ${stage.label === '購入' ? 'text-emerald-50' : 'text-emerald-800'}`}>{stage.label}</div>
                    <div className={`mt-1 text-2xl font-bold tabular-nums ${stage.label === '購入' ? 'text-white' : 'text-emerald-900'}`}>
                      {formatNumber(stage.count)}
                      <span className="ml-0.5 text-sm font-semibold">人</span>
                    </div>
                  </div>
                </div>
              ))}
              {funnelStages.map((stage, index) => (
                <div key={`drop-${stage.label}`} className="contents">
                  {index > 0 ? <div /> : null}
                  {stage.drop && stage.drop.count >= 0 ? (
                    <div className={`rounded-lg border px-3 py-2 text-xs ${stage.drop.alert > 0 ? 'border-red-300 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="font-semibold text-amber-900">↓ {stage.drop.label}</span>
                        <span className="text-base font-bold tabular-nums text-amber-900">{formatNumber(stage.drop.count)}人</span>
                      </div>
                      <div className="mt-1 text-amber-800">→ {stage.drop.dest}</div>
                      {stage.drop.alert > 0 ? (
                        <div className="mt-1 font-semibold text-red-600">⚠ {stage.drop.alertLabel} {formatNumber(stage.drop.alert)}人</div>
                      ) : null}
                    </div>
                  ) : stage.label === '購入' ? (
                    // 購入の下は空くので、リスト全体（LINE登録）に対する購入率を置く
                    <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs">
                      <div className="flex items-baseline justify-between gap-1">
                        <span className="font-semibold text-emerald-900">リスト全体の購入率</span>
                        <span className="text-base font-bold tabular-nums text-emerald-900">
                          {report.base > 0 ? formatPercent((stage.count / report.base) * 100) : '-'}
                        </span>
                      </div>
                      <div className="mt-1 text-emerald-800">
                        LINE登録 {formatNumber(report.base)}人 → 購入 {formatNumber(stage.count)}人
                      </div>
                    </div>
                  ) : (
                    <div />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-amber-200 bg-amber-50/60 px-3 py-2 text-xs text-amber-900">
            <span className="font-semibold">回収導線: 個別相談（これから配信開始 / 対象 {formatNumber(consultTargets)}人）</span>
            <span>タップ <b className="tabular-nums">{formatNumber(report.consultTapped)}</b>人</span>
            <span>→ 申込 <b className="tabular-nums">{formatNumber(report.consultApplied)}</b>人</span>
            <span>→ 参加 <b className="tabular-nums">{formatNumber(report.consultJoined)}</b>人</span>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-[color:var(--color-text-primary)]">日別の友だち登録</h3>
            <span className="text-xs text-[color:var(--color-text-muted)]">登録数とブロック数の推移</span>
          </div>
          {dailyRegistrationChart.length === 0 ? (
            <p className="mt-3 text-xs text-[color:var(--color-text-muted)]">この期間の登録はありません。</p>
          ) : (
            <div className="mt-3 h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyRegistrationChart} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(value: number, name: string) => [`${formatNumber(value)}人`, name]}
                    contentStyle={{
                      backgroundColor: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="registered" name="登録" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="blocked" name="ブロック" fill="#dc2626" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <details className="mt-6 group" open>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-[color:var(--color-text-primary)] [&::-webkit-details-marker]:hidden">
            <span className="text-[color:var(--color-text-muted)] transition-transform group-open:rotate-90">▶</span>
            登録日別の進捗
            <span className="ml-1 text-xs font-normal text-[color:var(--color-text-muted)]">
              （{dailyMovements.length}日分）
            </span>
          </summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr className="border-b border-[color:var(--color-border)]">
                  <th className="py-2 pr-3 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">登録日</th>
                  <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">登録</th>
                  <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">回答</th>
                  <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">回答率</th>
                  <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">申込</th>
                  <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">申込率</th>
                  <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">参加</th>
                  <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">参加率</th>
                  <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">購入</th>
                  <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">購入率</th>
                  <th className="py-2 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">ブロック</th>
                </tr>
              </thead>
              <tbody>
                {dailyMovements.map((day) => (
                  <tr key={day.date} className="border-b border-[color:var(--color-border)] last:border-0">
                    <td className="py-2 pr-3 text-sm text-[color:var(--color-text-primary)]">{day.date}</td>
                    <td className="py-2 pr-3 text-right text-sm tabular-nums text-[color:var(--color-text-primary)]">{formatNumber(day.registered)}</td>
                    <td className="py-2 pr-3 text-right text-sm tabular-nums text-[color:var(--color-text-primary)]">{formatNumber(day.answered)}</td>
                    <td className="py-2 pr-3 text-right text-xs tabular-nums text-[color:var(--color-text-secondary)]">{day.registered > 0 ? formatPercent((day.answered / day.registered) * 100) : '-'}</td>
                    <td className="py-2 pr-3 text-right text-sm font-semibold tabular-nums text-[color:var(--color-text-primary)]">{formatNumber(day.applied)}</td>
                    <td className="py-2 pr-3 text-right text-xs tabular-nums text-[color:var(--color-text-secondary)]">{day.answered > 0 ? formatPercent((day.applied / day.answered) * 100) : '-'}</td>
                    <td className="py-2 pr-3 text-right text-sm tabular-nums text-[color:var(--color-text-primary)]">{formatNumber(day.joined)}</td>
                    <td className="py-2 pr-3 text-right text-xs tabular-nums text-[color:var(--color-text-secondary)]">{day.applied > 0 ? formatPercent((day.joined / day.applied) * 100) : '-'}</td>
                    <td className="py-2 pr-3 text-right text-sm font-semibold tabular-nums text-emerald-700">{formatNumber(day.purchased)}</td>
                    <td className="py-2 pr-3 text-right text-xs tabular-nums text-[color:var(--color-text-secondary)]">{day.joined > 0 ? formatPercent((day.purchased / day.joined) * 100) : '-'}</td>
                    <td className="py-2 text-right text-sm tabular-nums text-red-600">{formatNumber(day.blocked)}</td>
                  </tr>
                ))}
                {dailyMovements.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-3 text-center text-xs text-[color:var(--color-text-muted)]">データなし</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </details>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">リードタイム分析（登録から何日で動くか）</h3>
          <span className="text-xs text-[color:var(--color-text-muted)]">申込のみ推定値（申込枠の開催日と日次データから算出。実際はこれより早い場合あり）</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--color-border)]">
                <th className="py-2 pr-3 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">アクション</th>
                <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">当日</th>
                <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">1日後</th>
                <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">2日後</th>
                <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">3日後</th>
                <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">4〜7日</th>
                <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">8日以降</th>
                <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">計測前</th>
                <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">計</th>
                <th className="py-2 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">平均</th>
              </tr>
            </thead>
            <tbody>
              {leadTime.map((row) => {
                const maxBucket = Math.max(...['d0', 'd1', 'd2', 'd3', 'd4_7', 'd8p'].map((b) => row.buckets[b] ?? 0), 1);
                const cell = (bucket: string) => {
                  const count = row.buckets[bucket] ?? 0;
                  const intensity = count > 0 ? 0.15 + (count / maxBucket) * 0.55 : 0;
                  return (
                    <td key={bucket} className="py-2 pr-3 text-right">
                      <span
                        className={`inline-block min-w-[36px] rounded px-1.5 py-0.5 text-sm tabular-nums ${count > 0 ? 'font-semibold text-sky-900' : 'text-[color:var(--color-text-muted)]'}`}
                        style={count > 0 ? { backgroundColor: `rgba(14, 165, 233, ${intensity})` } : undefined}
                      >
                        {count > 0 ? count : '-'}
                      </span>
                    </td>
                  );
                };
                return (
                  <tr key={row.key} className="border-b border-[color:var(--color-border)] last:border-0">
                    <td className="py-2 pr-3 text-sm font-medium text-[color:var(--color-text-primary)]">{row.label}</td>
                    {['d0', 'd1', 'd2', 'd3', 'd4_7', 'd8p'].map((bucket) => cell(bucket))}
                    <td className="py-2 pr-3 text-right text-xs tabular-nums text-[color:var(--color-text-muted)]">{(row.buckets.unknown ?? 0) > 0 ? row.buckets.unknown : '-'}</td>
                    <td className="py-2 pr-3 text-right text-sm font-semibold tabular-nums text-[color:var(--color-text-primary)]">{formatNumber(row.total)}</td>
                    <td className="py-2 text-right text-xs tabular-nums text-[color:var(--color-text-secondary)]">{row.avgDays !== null ? `${percentFormatter.format(row.avgDays)}日` : '-'}</td>
                  </tr>
                );
              })}
              {leadTime.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-3 text-center text-xs text-[color:var(--color-text-muted)]">データなし</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[2fr_1fr]">
        <Card className="p-5">
          <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">流入経路別</h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse">
              <thead>
                <tr className="border-b border-[color:var(--color-border)]">
                  <th className="py-2 pr-3 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">流入経路</th>
                  <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">登録</th>
                  <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">回答</th>
                  <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">申込</th>
                  <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">申込率</th>
                  <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">参加</th>
                  <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">参加率</th>
                  <th className="py-2 pr-3 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">購入</th>
                  <th className="py-2 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">ブロック率</th>
                </tr>
              </thead>
              <tbody>
                {sourceAnalysis.map((source) => (
                  <tr key={source.label} className="border-b border-[color:var(--color-border)] last:border-0">
                    <td className="py-2 pr-3 text-sm font-medium text-[color:var(--color-text-primary)]">{source.label}</td>
                    <td className="py-2 pr-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-2 w-16 overflow-hidden rounded bg-gray-100">
                          <div className="h-full bg-sky-400" style={{ width: `${(source.base / Math.max(...sourceAnalysis.map((item) => item.base), 1)) * 100}%` }} />
                        </div>
                        <span className="text-sm tabular-nums text-[color:var(--color-text-primary)]">{formatNumber(source.base)}</span>
                        <span className="w-12 text-right text-xs tabular-nums text-[color:var(--color-text-muted)]">{formatPercent((source.base / Math.max(sourceAnalysis.reduce((sum, item) => sum + item.base, 0), 1)) * 100)}</span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-right text-sm tabular-nums text-[color:var(--color-text-primary)]">{formatNumber(source.surveyCompleted)}</td>
                    <td className="py-2 pr-3 text-right text-sm font-semibold tabular-nums text-[color:var(--color-text-primary)]">{formatNumber(source.seminarApplied)}</td>
                    <td className={`py-2 pr-3 text-right text-xs tabular-nums ${source.seminarApplied > 0 && source.seminarApplicationRate >= Math.max(...sourceAnalysis.filter((item) => item.seminarApplied > 0).map((item) => item.seminarApplicationRate)) ? 'font-bold text-emerald-600' : 'text-[color:var(--color-text-secondary)]'}`}>{formatPercent(source.seminarApplicationRate)}</td>
                    <td className="py-2 pr-3 text-right text-sm tabular-nums text-[color:var(--color-text-primary)]">{formatNumber(source.seminarJoined)}</td>
                    <td className="py-2 pr-3 text-right text-xs tabular-nums text-[color:var(--color-text-secondary)]">{source.seminarApplied > 0 ? formatPercent(source.seminarJoinRate) : '-'}</td>
                    <td className="py-2 pr-3 text-right text-sm tabular-nums text-[color:var(--color-text-primary)]">{formatNumber(source.purchased)}</td>
                    <td className={`py-2 text-right text-xs tabular-nums ${source.blockedRate >= 10 ? 'font-bold text-red-600' : 'text-[color:var(--color-text-secondary)]'}`}>{formatPercent(source.blockedRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">ブロック時期</h3>
            <span className="text-xs tabular-nums text-[color:var(--color-text-muted)]">計 {formatNumber(report.blockedCount)}人</span>
          </div>
          <div className="mt-3 space-y-2">
            {blockTiming.map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-xs text-[color:var(--color-text-primary)]">{item.label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded bg-gray-100">
                  <div className="h-full bg-rose-500" style={{ width: `${(item.count / maxBlockTiming) * 100}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-[color:var(--color-text-primary)]">
                  {formatNumber(item.count)} <span className="font-normal text-[color:var(--color-text-muted)]">{formatPercent(item.rate)}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">セミナー枠別の申込状況</h3>
          <span className="text-xs text-[color:var(--color-text-muted)]">各枠: 申込・参加・購入 ／ 右の2値 = 参加率・購入率</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse">
            <thead>
              <tr className="border-b border-[color:var(--color-border)]">
                <th className="py-2 pr-3 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">日付</th>
                {slotTimes.map((time) => (
                  <th key={time} className="py-2 pr-3 text-center text-xs font-medium text-[color:var(--color-text-secondary)]">
                    {time}の枠
                  </th>
                ))}
                <th className="py-2 text-center text-xs font-medium text-[color:var(--color-text-secondary)]">日合計</th>
              </tr>
            </thead>
            <tbody>
              {slotDates.map((date) => {
                const slotsOfDay = slotTimes.map((time) =>
                  seminarSlots.find((slot) => slot.date === date && slot.time === time),
                );
                const dayTotal = sumCounts(slotsOfDay);
                return (
                  <tr key={date} className="border-b border-[color:var(--color-border)] last:border-0">
                    <td className="py-2.5 pr-3 text-sm font-medium text-[color:var(--color-text-primary)]">{date}</td>
                    {slotsOfDay.map((slot, index) => (
                      <td key={slotTimes[index]} className="py-2.5 pr-3 text-center">{renderCounts(slot)}</td>
                    ))}
                    <td className="py-2.5 text-center">{renderCounts(dayTotal)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-[color:var(--color-border)] bg-[color:var(--color-bg-hover)] font-semibold">
                <td className="py-2 pr-3 text-sm text-[color:var(--color-text-primary)]">合計</td>
                {slotTimes.map((time) => (
                  <td key={time} className="py-2 pr-3 text-center">
                    {renderCounts(sumCounts(seminarSlots.filter((slot) => slot.time === time)))}
                  </td>
                ))}
                <td className="py-2 text-center">{renderCounts(sumCounts(seminarSlots))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">デモグラ分析</h3>
          <span className="text-xs text-[color:var(--color-text-muted)]">誰が申込み、誰が参加して、誰が買っているか</span>
        </div>
        <div className="mt-3 space-y-1.5 rounded border border-sky-200 bg-sky-50/60 px-3 py-2 text-xs text-sky-900">
          {topApplicantProfile ? (
            <p><b>申込の中心層:</b> {topApplicantProfile}</p>
          ) : null}
          {purchaserProfile ? (
            <p><b>購入者のプロフィール:</b> {purchaserProfile}</p>
          ) : (
            <p><b>購入者のプロフィール:</b> まだ購入者がいません</p>
          )}
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {demographicSegments.map((segment) => (
            <div key={segment.key} className="rounded border border-[color:var(--color-border)] p-3">
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-sm font-semibold text-[color:var(--color-text-primary)]">{segment.label}</h4>
                <span className="text-xs tabular-nums text-[color:var(--color-text-muted)]">{formatNumber(segment.total)}人</span>
              </div>
              <div className="mt-3 space-y-4">
                {segment.groups.length > 0 ? segment.groups.map((group) => (
                  <div key={group.key}>
                    <div className="text-xs font-medium text-[color:var(--color-text-secondary)]">{group.label}</div>
                    <div className="mt-1 space-y-1.5">
                      {group.items.map((item) => (
                        <div key={item.key} className="relative overflow-hidden rounded px-1.5 py-0.5">
                          <div className="absolute inset-y-0 left-0 bg-sky-100" style={{ width: `${item.rate}%` }} />
                          <div className="relative flex items-center justify-between gap-2 text-xs">
                            <span className="text-[color:var(--color-text-primary)]">{item.label}</span>
                            <span className="tabular-nums text-[color:var(--color-text-secondary)]">
                              {formatNumber(item.count)} / {formatPercent(item.rate)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )) : (
                  <p className="text-xs text-[color:var(--color-text-muted)]">該当データなし</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <details className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[color:var(--color-text-primary)]">
          配信パネル別タップ集計（コピー・タイミング改善用の診断データ）
        </summary>
        <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {data.sections.map((section) => {
          const sectionMax = Math.max(...section.items.map((i) => i.count), 1);
          return (
            <Card key={section.title} className="p-5">
              <h3 className="text-base font-semibold text-[color:var(--color-text-primary)]">{section.title}</h3>
              <table className="mt-3 w-full border-collapse">
                <thead>
                  <tr className="border-b border-[color:var(--color-border)]">
                    <th className="py-2 pr-2 text-left text-xs font-medium text-[color:var(--color-text-secondary)]">項目</th>
                    <th className="py-2 pr-2 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">タップ数</th>
                    <th className="py-2 pr-2 text-right text-xs font-medium text-[color:var(--color-text-secondary)]">全体比</th>
                    <th className="py-2 text-left text-xs font-medium text-[color:var(--color-text-secondary)]" style={{ width: '30%' }} />
                  </tr>
                </thead>
                <tbody>
                  {section.items.map((item) => (
                    <tr key={item.label} className="border-b border-[color:var(--color-border)] last:border-0">
                      <td className="py-2 pr-2 text-sm text-[color:var(--color-text-primary)]">
                        {item.label}
                        {item.missing ? (
                          <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">データ未取込</span>
                        ) : null}
                      </td>
                      <td className="py-2 pr-2 text-right text-sm font-semibold tabular-nums text-[color:var(--color-text-primary)]">
                        {formatNumber(item.count)}
                      </td>
                      <td className="py-2 pr-2 text-right text-xs tabular-nums text-[color:var(--color-text-secondary)]">
                        {formatPercent(item.rate)}
                      </td>
                      <td className="py-2">
                        <div className="relative h-3 w-full overflow-hidden rounded bg-gray-100">
                          <div
                            className="h-full bg-sky-500"
                            style={{ width: `${(item.count / sectionMax) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          );
        })}
        </div>
      </details>

      {data.missingColumns.length > 0 ? (
        <Card className="p-4">
          <p className="text-xs text-amber-700">
            未取込カラム（次回のCSV取り込みで反映予定）: {data.missingColumns.join(', ')}
          </p>
        </Card>
      ) : null}
    </div>
  );
}
