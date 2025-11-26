'use client';

import { Card } from '@/components/ui/card';

interface CrossAnalysisRow {
  dimension1: string;
  dimension2: string;
  count: number;
}

interface FourAxisRow {
  age: string;
  job: string;
  revenue: string;
  goal: string;
  count: number;
}

interface ThreeAxisRow {
  age: string;
  job: string;
  revenue: string;
  count: number;
}

interface CrossAnalysisSummary {
  totalUsers: number;
  lowRevenue: number;
  goal100man: number;
  age30to50: number;
  employeeFreelance: number;
}

interface ByAgeData {
  age: string;
  total: number;
  jobBreakdown: { job: string; count: number; percent: number }[];
  revenueBreakdown: { revenue: string; count: number; percent: number }[];
  goalBreakdown: { goal: string; count: number; percent: number }[];
}

export interface CrossAnalysisData {
  ageJob: CrossAnalysisRow[];
  ageRevenue: CrossAnalysisRow[];
  ageGoal: CrossAnalysisRow[];
  jobRevenue: CrossAnalysisRow[];
  jobGoal: CrossAnalysisRow[];
  revenueGoal: CrossAnalysisRow[];
  topCombinations: FourAxisRow[];
  threeAxisCombinations: ThreeAxisRow[];
  byAge?: ByAgeData[];
  summary: CrossAnalysisSummary;
}

interface CrossAnalysisProps {
  data: CrossAnalysisData | null;
  loading: boolean;
  error: string | null;
}

const numberFormatter = new Intl.NumberFormat('ja-JP');

function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}

// AutoStudioトンマナに準拠したカラー
const ageColors: Record<string, { bg: string; text: string; border: string }> = {
  '20代': { bg: 'bg-[#161819]', text: 'text-[color:var(--color-text-primary)]', border: 'border-[color:var(--color-border)]' },
  '30代': { bg: 'bg-[#161819]', text: 'text-[color:var(--color-text-primary)]', border: 'border-[color:var(--color-border)]' },
  '40代': { bg: 'bg-[#161819]', text: 'text-[color:var(--color-text-primary)]', border: 'border-[color:var(--color-border)]' },
  '50代': { bg: 'bg-[#161819]', text: 'text-[color:var(--color-text-primary)]', border: 'border-[color:var(--color-border)]' },
};

// クロス集計テーブルを構築
function buildCrossTable(
  data: CrossAnalysisRow[],
  dim1Order: string[],
  dim2Order: string[],
): { rows: { dim1: string; values: number[]; total: number }[]; dim2Totals: number[]; grandTotal: number } {
  const matrix: Record<string, Record<string, number>> = {};

  for (const row of data) {
    if (!matrix[row.dimension1]) matrix[row.dimension1] = {};
    matrix[row.dimension1][row.dimension2] = (matrix[row.dimension1][row.dimension2] || 0) + row.count;
  }

  const rows = dim1Order.map((dim1) => {
    const values = dim2Order.map((dim2) => matrix[dim1]?.[dim2] || 0);
    const total = values.reduce((a, b) => a + b, 0);
    return { dim1, values, total };
  });

  const dim2Totals = dim2Order.map((_, colIdx) =>
    rows.reduce((sum, row) => sum + row.values[colIdx], 0)
  );
  const grandTotal = dim2Totals.reduce((a, b) => a + b, 0);

  return { rows, dim2Totals, grandTotal };
}

interface CrossTableProps {
  title: string;
  data: CrossAnalysisRow[];
  dim1Label: string;
  dim2Label: string;
  dim1Order: string[];
  dim2Order: string[];
  highlightMax?: boolean;
}

function CrossTable({ data, dim1Label, dim2Label, dim1Order, dim2Order, highlightMax = true }: CrossTableProps) {
  const { rows, dim2Totals, grandTotal } = buildCrossTable(data, dim1Order, dim2Order);

  const allValues = rows.flatMap(r => r.values);
  const maxValue = Math.max(...allValues, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[color:var(--color-border)]">
            <th className="py-2 px-3 text-left font-medium text-[color:var(--color-text-secondary)]">
              {dim1Label} \ {dim2Label}
            </th>
            {dim2Order.map((dim2) => (
              <th key={dim2} className="py-2 px-3 text-center font-medium text-[color:var(--color-text-secondary)]">
                {dim2}
              </th>
            ))}
            <th className="py-2 px-3 text-center font-medium text-[color:var(--color-text-muted)] bg-[color:var(--color-surface-muted)]">
              計
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.dim1} className="border-b border-[color:var(--color-border)] last:border-b-0">
              <td className="py-2 px-3 font-medium text-[color:var(--color-text-primary)]">
                {row.dim1}
              </td>
              {row.values.map((value, idx) => {
                const isMax = highlightMax && value === maxValue && value > 0;
                return (
                  <td
                    key={dim2Order[idx]}
                    className={`py-2 px-3 text-center ${
                      isMax
                        ? 'bg-[color:var(--color-surface-muted)] font-bold text-[color:var(--color-text-primary)]'
                        : value > 0
                        ? 'text-[color:var(--color-text-primary)]'
                        : 'text-[color:var(--color-text-muted)]'
                    }`}
                  >
                    {value > 0 ? formatNumber(value) : '-'}
                  </td>
                );
              })}
              <td className="py-2 px-3 text-center font-medium text-[color:var(--color-text-secondary)] bg-[color:var(--color-surface-muted)]">
                {formatNumber(row.total)}
              </td>
            </tr>
          ))}
          <tr className="bg-[color:var(--color-surface-muted)]">
            <td className="py-2 px-3 font-medium text-[color:var(--color-text-muted)]">計</td>
            {dim2Totals.map((total, idx) => (
              <td key={dim2Order[idx]} className="py-2 px-3 text-center font-medium text-[color:var(--color-text-secondary)]">
                {formatNumber(total)}
              </td>
            ))}
            <td className="py-2 px-3 text-center font-bold text-[color:var(--color-text-primary)]">
              {formatNumber(grandTotal)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// 年代×職業ごとの詳細を計算
function buildAgeJobDetails(
  fourAxisData: FourAxisRow[],
  threeAxisData: ThreeAxisRow[],
): Map<string, Map<string, { total: number; revenue: { label: string; count: number; percent: number }[]; goal: { label: string; count: number; percent: number }[] }>> {
  const revenueOrder = ['0円', '1-10万', '10-50万', '50-100万', '100万+'];
  const goalOrder = ['10万', '50万', '100万', '300万+'];

  const result = new Map<string, Map<string, { total: number; revenue: { label: string; count: number; percent: number }[]; goal: { label: string; count: number; percent: number }[] }>>();

  // 3軸データから売上を集計
  const ageJobRevenue: Record<string, Record<string, Record<string, number>>> = {};
  for (const row of threeAxisData) {
    if (!ageJobRevenue[row.age]) ageJobRevenue[row.age] = {};
    if (!ageJobRevenue[row.age][row.job]) ageJobRevenue[row.age][row.job] = {};
    ageJobRevenue[row.age][row.job][row.revenue] = (ageJobRevenue[row.age][row.job][row.revenue] || 0) + row.count;
  }

  // 4軸データから目標を集計
  const ageJobGoal: Record<string, Record<string, Record<string, number>>> = {};
  for (const row of fourAxisData) {
    if (!ageJobGoal[row.age]) ageJobGoal[row.age] = {};
    if (!ageJobGoal[row.age][row.job]) ageJobGoal[row.age][row.job] = {};
    ageJobGoal[row.age][row.job][row.goal] = (ageJobGoal[row.age][row.job][row.goal] || 0) + row.count;
  }

  // 結果をまとめる
  const ages = ['20代', '30代', '40代', '50代'];
  const jobs = ['会社員', 'フリーランス', '経営者', '主婦', '学生'];

  for (const age of ages) {
    const jobMap = new Map<string, { total: number; revenue: { label: string; count: number; percent: number }[]; goal: { label: string; count: number; percent: number }[] }>();

    for (const job of jobs) {
      const revenueData = ageJobRevenue[age]?.[job] || {};
      const goalData = ageJobGoal[age]?.[job] || {};

      const totalRevenue = Object.values(revenueData).reduce((a, b) => a + b, 0);
      const totalGoal = Object.values(goalData).reduce((a, b) => a + b, 0);
      const total = Math.max(totalRevenue, totalGoal);

      if (total === 0) continue;

      const revenue = revenueOrder
        .map(r => ({
          label: r,
          count: revenueData[r] || 0,
          percent: totalRevenue > 0 ? ((revenueData[r] || 0) / totalRevenue) * 100 : 0,
        }))
        .filter(r => r.count > 0)
        .sort((a, b) => b.count - a.count);

      const goal = goalOrder
        .map(g => ({
          label: g,
          count: goalData[g] || 0,
          percent: totalGoal > 0 ? ((goalData[g] || 0) / totalGoal) * 100 : 0,
        }))
        .filter(g => g.count > 0)
        .sort((a, b) => b.count - a.count);

      jobMap.set(job, { total, revenue, goal });
    }

    result.set(age, jobMap);
  }

  return result;
}

// 年代別詳細カード（職業ごとの売上・目標も表示）
function AgeDetailCard({
  ageData,
  totalUsers,
  jobDetails,
}: {
  ageData: ByAgeData;
  totalUsers: number;
  jobDetails: Map<string, { total: number; revenue: { label: string; count: number; percent: number }[]; goal: { label: string; count: number; percent: number }[] }>;
}) {
  const percent = totalUsers > 0 ? (ageData.total / totalUsers) * 100 : 0;
  const colors = ageColors[ageData.age] || { bg: 'bg-gray-500', text: 'text-gray-600', border: 'border-gray-300' };

  // 職業を人数順にソート
  const sortedJobs = [...ageData.jobBreakdown].sort((a, b) => b.count - a.count);

  return (
    <div className={`rounded-xl border-2 ${colors.border} bg-[color:var(--color-surface)] overflow-hidden`}>
      {/* ヘッダー */}
      <div className={`${colors.bg} px-4 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/20 text-white font-bold text-xl">
            {ageData.age.replace('代', '')}
          </span>
          <div className="text-white">
            <p className="text-xl font-bold">{ageData.age}</p>
            <p className="text-sm opacity-90">{formatNumber(ageData.total)}人 (全体の{percent.toFixed(1)}%)</p>
          </div>
        </div>
      </div>

      {/* 職業ごとの詳細 */}
      <div className="divide-y divide-[color:var(--color-border)]">
        {sortedJobs.map((jobItem, jobIdx) => {
          const detail = jobDetails.get(jobItem.job);
          if (!detail || detail.total === 0) return null;

          return (
            <div key={jobItem.job} className={`p-4 ${jobIdx === 0 ? 'bg-[color:var(--color-surface-muted)]' : ''}`}>
              {/* 職業ヘッダー */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`text-base font-bold ${jobIdx === 0 ? 'text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-primary)]'}`}>
                    {jobItem.job}
                  </span>
                  {jobIdx === 0 && (
                    <span className="text-xs bg-[color:var(--color-text-primary)] text-white px-1.5 py-0.5 rounded font-medium">TOP</span>
                  )}
                </div>
                <span className="text-sm font-semibold text-[color:var(--color-text-primary)]">
                  {formatNumber(detail.total)}人
                  <span className="text-[color:var(--color-text-secondary)] font-normal ml-1">
                    ({ageData.total > 0 ? ((detail.total / ageData.total) * 100).toFixed(0) : 0}%)
                  </span>
                </span>
              </div>

              {/* 売上・目標の2列 */}
              <div className="grid grid-cols-2 gap-4">
                {/* 現在売上 */}
                <div>
                  <p className="text-xs font-semibold text-[color:var(--color-text-muted)] mb-2">現在売上</p>
                  <div className="space-y-1">
                    {detail.revenue.slice(0, 3).map((r, idx) => (
                      <div key={r.label} className="flex items-center gap-2">
                        <div className="flex-1 h-5 bg-[color:var(--color-surface-muted)] rounded overflow-hidden">
                          <div
                            className={`h-full ${idx === 0 ? 'bg-[color:var(--color-success)]' : 'bg-[color:var(--color-success)] opacity-40'}`}
                            style={{ width: `${r.percent}%` }}
                          />
                        </div>
                        <span className={`text-xs w-20 text-right ${idx === 0 ? 'font-bold text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-secondary)]'}`}>
                          {r.label} {r.percent.toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 目標売上 */}
                <div>
                  <p className="text-xs font-semibold text-[color:var(--color-text-muted)] mb-2">目標売上</p>
                  <div className="space-y-1">
                    {detail.goal.slice(0, 3).map((g, idx) => (
                      <div key={g.label} className="flex items-center gap-2">
                        <div className="flex-1 h-5 bg-[color:var(--color-surface-muted)] rounded overflow-hidden">
                          <div
                            className={`h-full ${idx === 0 ? 'bg-[color:var(--color-accent)]' : 'bg-[color:var(--color-accent)] opacity-40'}`}
                            style={{ width: `${g.percent}%` }}
                          />
                        </div>
                        <span className={`text-xs w-20 text-right ${idx === 0 ? 'font-bold text-[color:var(--color-text-primary)]' : 'text-[color:var(--color-text-secondary)]'}`}>
                          {g.label} {g.percent.toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CrossAnalysis({ data, loading, error }: CrossAnalysisProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-[color:var(--color-surface-muted)] rounded" />
          <div className="h-40 bg-[color:var(--color-surface-muted)] rounded" />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6">
        <p className="text-sm text-[color:var(--color-danger)]">エラーが発生しました: {error}</p>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className="p-6">
        <p className="text-sm text-[color:var(--color-text-muted)]">データがありません。</p>
      </Card>
    );
  }

  const { summary } = data;
  const ageOrder = ['20代', '30代', '40代', '50代', '60代'];
  const jobOrder = ['会社員', 'フリーランス', '経営者', '主婦', '学生'];
  const revenueOrder = ['0円', '1-10万', '10-50万', '50-100万', '100万+'];
  const goalOrder = ['10万', '50万', '100万', '300万+'];

  // 年代データを人数順にソート
  const sortedByAge = data.byAge ? [...data.byAge].sort((a, b) => b.total - a.total) : [];

  // 年代×職業ごとの詳細を計算
  const ageJobDetails = buildAgeJobDetails(data.topCombinations, data.threeAxisCombinations);

  return (
    <div className="space-y-6">
      {/* サマリー */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">登録者サマリー</h2>
        <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
          一言で言うと「<span className="font-bold text-[color:var(--color-accent)]">30〜50代の会社員・フリーランスで、今は月0〜10万だけど、月100万稼ぎたい人</span>」が多い
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3 text-center">
            <p className="text-2xl font-bold text-[color:var(--color-text-primary)]">{formatNumber(summary.totalUsers)}人</p>
            <p className="text-xs text-[color:var(--color-text-muted)]">アンケート回答者</p>
          </div>
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3 text-center">
            <p className="text-2xl font-bold text-[color:var(--color-text-primary)]">{summary.totalUsers > 0 ? Math.round((summary.lowRevenue / summary.totalUsers) * 100) : 0}%</p>
            <p className="text-xs text-[color:var(--color-text-muted)]">月0〜10万の人</p>
          </div>
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3 text-center">
            <p className="text-2xl font-bold text-[color:var(--color-text-primary)]">{summary.totalUsers > 0 ? Math.round((summary.goal100man / summary.totalUsers) * 100) : 0}%</p>
            <p className="text-xs text-[color:var(--color-text-muted)]">月100万目標</p>
          </div>
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3 text-center">
            <p className="text-2xl font-bold text-[color:var(--color-text-primary)]">{summary.totalUsers > 0 ? Math.round((summary.age30to50 / summary.totalUsers) * 100) : 0}%</p>
            <p className="text-xs text-[color:var(--color-text-muted)]">30〜50代</p>
          </div>
          <div className="rounded-lg border border-[color:var(--color-border)] bg-[color:var(--color-surface-muted)] p-3 text-center">
            <p className="text-2xl font-bold text-[color:var(--color-text-primary)]">{summary.totalUsers > 0 ? Math.round((summary.employeeFreelance / summary.totalUsers) * 100) : 0}%</p>
            <p className="text-xs text-[color:var(--color-text-muted)]">会社員+フリーランス</p>
          </div>
        </div>
      </Card>

      {/* 2軸クロス集計テーブル */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)] mb-4">
          2軸クロス集計
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-base font-semibold text-[color:var(--color-text-primary)] mb-4">年齢×職業</h3>
            <CrossTable
              title="年齢×職業"
              data={data.ageJob}
              dim1Label="年齢"
              dim2Label="職業"
              dim1Order={ageOrder}
              dim2Order={jobOrder}
            />
          </div>

          <div>
            <h3 className="text-base font-semibold text-[color:var(--color-text-primary)] mb-4">職業×現在売上</h3>
            <CrossTable
              title="職業×現在売上"
              data={data.jobRevenue}
              dim1Label="職業"
              dim2Label="現在売上"
              dim1Order={jobOrder}
              dim2Order={revenueOrder}
            />
          </div>

          <div>
            <h3 className="text-base font-semibold text-[color:var(--color-text-primary)] mb-4">職業×目標売上</h3>
            <CrossTable
              title="職業×目標売上"
              data={data.jobGoal}
              dim1Label="職業"
              dim2Label="目標売上"
              dim1Order={jobOrder}
              dim2Order={goalOrder}
            />
          </div>

          <div>
            <h3 className="text-base font-semibold text-[color:var(--color-text-primary)] mb-4">現在売上×目標売上</h3>
            <CrossTable
              title="現在売上×目標売上"
              data={data.revenueGoal}
              dim1Label="現在売上"
              dim2Label="目標売上"
              dim1Order={revenueOrder}
              dim2Order={goalOrder}
            />
          </div>
        </div>
      </Card>

      {/* 年代別詳細（職業ごとの売上・目標も表示） */}
      {sortedByAge.length > 0 && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">
            年代別セグメント詳細
          </h2>
          <p className="mt-1 mb-4 text-sm text-[color:var(--color-text-secondary)]">
            各年代 × 職業ごとの現在売上・目標売上の内訳
          </p>
          <div className="space-y-4">
            {sortedByAge.map((ageData) => (
              <AgeDetailCard
                key={ageData.age}
                ageData={ageData}
                totalUsers={summary.totalUsers}
                jobDetails={ageJobDetails.get(ageData.age) || new Map()}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
