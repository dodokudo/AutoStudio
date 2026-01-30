'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { dashboardCardClass } from '@/components/dashboard/styles';
import type { HomeDashboardData } from '@/lib/home/dashboard';
import type { KpiTarget } from '@/lib/home/kpi-types';
import { calculateAchievementRate } from '@/lib/home/kpi-types';
import { PacePredictionCard } from './PacePredictionCard';
import { LineSourceBreakdown } from './LineSourceBreakdown';
import { HomeFunnelPanel } from './HomeFunnelPanel';
import { DailyTrendChart } from './DailyTrendChart';
import { DailyDetailsTable } from './DailyDetailsTable';

// ============================================================
// 型定義
// ============================================================

interface DashboardTabProps {
  data: HomeDashboardData;
  kpiTarget: KpiTarget | null;
  currentMonth: string;
}

interface MonthlyActualsResponse {
  success: boolean;
  data: {
    month: string;
    revenue: number;
    lineRegistrations: number;
    seminarParticipants: number;
    frontendPurchases: number;
    backendPurchases: number;
    daily?: Array<{
      date: string;
      revenue: number;
      lineRegistrations: number;
      threadsFollowerDelta: number;
      instagramFollowerDelta: number;
      frontendPurchases: number;
      backendPurchases: number;
    }>;
  };
}

// ============================================================
// ユーティリティ
// ============================================================

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
};

function getDaysInMonth(month: string): number {
  const [year, monthNum] = month.split('-').map(Number);
  return new Date(year, monthNum, 0).getDate();
}

function getDaysElapsed(month: string): number {
  const now = new Date();
  const [year, monthNum] = month.split('-').map(Number);

  if (now.getFullYear() !== year || now.getMonth() + 1 !== monthNum) {
    const targetDate = new Date(year, monthNum - 1, 1);
    if (targetDate < now) {
      return getDaysInMonth(month);
    }
    return 0;
  }

  return now.getDate();
}

// ============================================================
// コンポーネント
// ============================================================

export function DashboardTab({ data, kpiTarget, currentMonth }: DashboardTabProps) {
  const totalDays = getDaysInMonth(currentMonth);
  const daysElapsed = getDaysElapsed(currentMonth);
  const remainingDays = Math.max(0, totalDays - daysElapsed);

  // 実績データをAPIから取得
  const { data: actualsResponse, error: actualsError, isLoading } = useSWR<MonthlyActualsResponse>(
    `/api/home/monthly-actuals?month=${currentMonth}`,
    fetcher,
    { refreshInterval: 60000 } // 1分ごとに更新
  );
  const { data: dailyResponse, error: dailyError, isLoading: isDailyLoading } = useSWR<MonthlyActualsResponse>(
    `/api/home/monthly-actuals?month=${currentMonth}&daily=true`,
    fetcher,
    { refreshInterval: 60000 }
  );

  const actuals = useMemo(() => {
    if (!actualsResponse?.data) {
      return {
        revenue: 0,
        lineRegistrations: 0,
        seminarParticipants: 0,
        frontendPurchases: 0,
        backendPurchases: 0,
      };
    }
    return {
      revenue: actualsResponse.data.revenue,
      lineRegistrations: actualsResponse.data.lineRegistrations,
      seminarParticipants: actualsResponse.data.seminarParticipants,
      frontendPurchases: actualsResponse.data.frontendPurchases,
      backendPurchases: actualsResponse.data.backendPurchases,
    };
  }, [actualsResponse]);

  const dailyData = useMemo(() => {
    return dailyResponse?.data?.daily ?? [];
  }, [dailyResponse]);

  // KPI進捗計算

  const progressBoard = useMemo(() => {
    if (!kpiTarget || totalDays <= 0) return null;

    const formatNumber = (value: number) => new Intl.NumberFormat('ja-JP').format(Math.round(value));
    const formatCurrency = (value: number) => {
      if (value >= 10000) return `${formatNumber(value / 10000)}万円`;
      return `${formatNumber(value)}円`;
    };

    const baseDays = kpiTarget?.workingDays && kpiTarget.workingDays > 0 ? kpiTarget.workingDays : totalDays;
    const expectedRate = baseDays > 0 ? Math.min(100, (daysElapsed / baseDays) * 100) : 0;
    const expectedValue = (target: number) => (target * expectedRate) / 100;

    const threadsCurrent = data.followerBreakdown.find((item) => item.platform === 'threads')?.count ?? 0;
    const instagramCurrent = data.followerBreakdown.find((item) => item.platform === 'instagram')?.count ?? 0;
    const threadsIncrease = Math.max(0, threadsCurrent - data.followerStarts.threads);
    const instagramIncrease = Math.max(0, instagramCurrent - data.followerStarts.instagram);

    const getStatus = (progressRate: number) => {
      const diff = progressRate - expectedRate;
      if (diff >= 5) return { label: '先行', tone: 'text-green-600' };
      if (diff <= -5) return { label: '遅れ', tone: 'text-red-600' };
      return { label: '予定通り', tone: 'text-[color:var(--color-text-muted)]' };
    };

    const rows = [
      {
        label: '売上',
        current: actuals.revenue,
        target: kpiTarget.targetRevenue,
        unit: 'currency',
      },
      {
        label: 'フロント購入',
        current: actuals.frontendPurchases,
        target: kpiTarget.targetFrontendPurchases,
        unit: '件',
      },
      {
        label: 'バック購入',
        current: actuals.backendPurchases,
        target: kpiTarget.targetBackendPurchases,
        unit: '件',
      },
      {
        label: 'LINE登録',
        current: actuals.lineRegistrations,
        target: kpiTarget.targetLineRegistrations,
        unit: '件',
      },
      {
        label: 'Threads',
        current: threadsIncrease,
        target: kpiTarget.targetThreadsFollowers,
        unit: '人',
      },
      {
        label: 'Instagram',
        current: instagramIncrease,
        target: kpiTarget.targetInstagramFollowers,
        unit: '人',
      },
    ];

    const formatValue = (value: number, unit: string) => {
      if (unit === 'currency') return formatCurrency(value);
      return `${formatNumber(value)}${unit}`;
    };

    return rows.map((row) => {
      const progressRate = row.target > 0 ? (row.current / row.target) * 100 : 0;
      const expected = row.target > 0 ? expectedValue(row.target) : 0;
      const diff = progressRate - expectedRate;
      const status = getStatus(progressRate);
      const targetPerDay = baseDays > 0 ? row.target / baseDays : 0;
      const remainingDays = Math.max(0, totalDays - daysElapsed);
      const remaining = Math.max(0, row.target - row.current);
      const remainingPerDay = remainingDays > 0 ? remaining / remainingDays : 0;

      const isPurchase = row.label === 'フロント購入' || row.label === 'バック購入';
      const targetPerWeek = targetPerDay * 7;
      const remainingPerWeek = remainingPerDay * 7;

      const targetPaceLabel = row.unit === 'currency'
        ? `目標 ${formatCurrency(targetPerDay)}/日`
        : isPurchase
          ? `目標 ${formatNumber(targetPerWeek)}${row.unit}/週`
          : `目標 ${formatNumber(targetPerDay)}${row.unit}/日`;

      const remainingPaceLabel = row.unit === 'currency'
        ? `残り ${formatCurrency(remainingPerDay)}/日`
        : isPurchase
          ? `残り ${formatNumber(remainingPerWeek)}${row.unit}/週`
          : `残り ${formatNumber(remainingPerDay)}${row.unit}/日`;
      return {
        ...row,
        progressRate,
        expected,
        expectedRate,
        diff,
        status,
        displayCurrent: formatValue(row.current, row.unit),
        displayTarget: formatValue(row.target, row.unit),
        displayExpected: formatValue(expected, row.unit),
        targetPaceLabel,
        remainingPaceLabel,
      };
    });
  }, [kpiTarget, totalDays, daysElapsed, actuals, data.followerBreakdown, data.followerStarts]);

  // ペース予測計算
  const pacePredictions = useMemo(() => {
    if (!kpiTarget || daysElapsed === 0) return null;

    const dailyRate = (actual: number) => actual / daysElapsed;
    const projected = (actual: number) => dailyRate(actual) * totalDays;

    return {
      revenue: {
        metric: 'revenue',
        label: '売上',
        currentActual: actuals.revenue,
        projectedMonthEnd: projected(actuals.revenue),
        target: kpiTarget.targetRevenue,
        projectedAchievementRate: calculateAchievementRate(projected(actuals.revenue), kpiTarget.targetRevenue),
        remainingDays,
        requiredDailyRate: remainingDays > 0 ? (kpiTarget.targetRevenue - actuals.revenue) / remainingDays : 0,
      },
      lineRegistrations: {
        metric: 'lineRegistrations',
        label: 'LINE登録',
        currentActual: actuals.lineRegistrations,
        projectedMonthEnd: projected(actuals.lineRegistrations),
        target: kpiTarget.targetLineRegistrations,
        projectedAchievementRate: calculateAchievementRate(projected(actuals.lineRegistrations), kpiTarget.targetLineRegistrations),
        remainingDays,
        requiredDailyRate: remainingDays > 0 ? (kpiTarget.targetLineRegistrations - actuals.lineRegistrations) / remainingDays : 0,
      },
    };
  }, [kpiTarget, actuals, daysElapsed, totalDays, remainingDays]);

  // LINE登録流入元
  const lineSourceData = useMemo(() => {
    return data.lineRegistrationBySource || [];
  }, [data.lineRegistrationBySource]);

  // ファネル転換率

  // KPI目標が設定されていない場合
  return (
    <div className="space-y-6">
      {/* ローディング表示 */}
      {isLoading && (
        <Card className={`${dashboardCardClass} text-center py-4`}>
          <p className="text-sm text-[color:var(--color-text-muted)]">実績データを読み込み中...</p>
        </Card>
      )}

      {/* エラー表示 */}
      {actualsError && (
        <Card className={`${dashboardCardClass} text-center py-4`}>
          <p className="text-sm text-red-500">実績データの取得に失敗しました</p>
        </Card>
      )}
      {dailyError && (
        <Card className={`${dashboardCardClass} text-center py-4`}>
          <p className="text-sm text-red-500">デイリー実績の取得に失敗しました</p>
        </Card>
      )}

      {progressBoard ? (
        <Card className={dashboardCardClass}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">本日時点の進捗</h2>
              <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                {new Date().toLocaleDateString('ja-JP')} / 経過 {daysElapsed}日 / {totalDays}日
              </p>
            </div>
            <div className="text-xs text-[color:var(--color-text-muted)]">
              予定進捗 {((daysElapsed / totalDays) * 100).toFixed(1)}%
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {progressBoard.map((row) => (
              <div key={row.label} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-[color:var(--color-text-secondary)]">{row.label}</span>
                  <span className={`text-xs font-semibold ${row.status.tone}`}>{row.status.label}</span>
                </div>
                <div className="mt-2 text-base font-semibold text-[color:var(--color-text-primary)]">
                  {row.displayCurrent} / {row.displayTarget}
                </div>
                <div className="mt-2">
                  <div className="relative h-2 w-full rounded-full bg-[color:var(--color-border)]">
                    <div
                      className={`h-full rounded-full transition-all ${row.status.tone === 'text-green-600' ? 'bg-green-500' : row.status.tone === 'text-red-600' ? 'bg-red-500' : 'bg-[color:var(--color-accent)]'}`}
                      style={{ width: `${Math.min(100, Math.max(0, row.progressRate))}%` }}
                    />
                    <div
                      className="absolute top-[-2px] h-3 w-1 rounded-full bg-[color:var(--color-text-primary)]"
                      style={{ left: `${Math.min(100, Math.max(0, row.expectedRate))}%`, transform: 'translateX(-50%)' }}
                    />
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-[color:var(--color-text-muted)]">
                  <span>達成率 {row.progressRate.toFixed(1)}%</span>
                  <span>本来 {row.displayExpected}</span>
                </div>
                <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  {row.targetPaceLabel}
                </div>
                <div className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  {row.remainingPaceLabel}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {!kpiTarget && (
        <Card className={`${dashboardCardClass} text-center py-6`}>
          <p className="text-[color:var(--color-text-secondary)]">
            KPI目標が設定されていません。
          </p>
          <p className="mt-2 text-sm text-[color:var(--color-text-muted)]">
            「KPI目標設定」タブで目標を入力してください。
          </p>
        </Card>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        {/* 今月ペース予測 */}
        {pacePredictions ? (
          <PacePredictionCard
            predictions={pacePredictions}
            daysElapsed={daysElapsed}
            totalDays={totalDays}
          />
        ) : (
          <div />
        )}

        {/* LINE登録流入元別 */}
        <LineSourceBreakdown data={lineSourceData} />
      </section>

      {/* ファネル（ホーム専用表示） */}
      <HomeFunnelPanel startDate={data.period.start} endDate={data.period.end} />

      {/* デイリー推移グラフ */}
      {isDailyLoading ? (
        <Card className={`${dashboardCardClass} text-center py-4`}>
          <p className="text-sm text-[color:var(--color-text-muted)]">デイリー実績を読み込み中...</p>
        </Card>
      ) : (
        <DailyTrendChart data={dailyData} />
      )}

      {/* デイリー詳細テーブル */}
      {isDailyLoading ? (
        <Card className={`${dashboardCardClass} text-center py-4`}>
          <p className="text-sm text-[color:var(--color-text-muted)]">デイリー詳細を読み込み中...</p>
        </Card>
      ) : (
        <DailyDetailsTable
          data={dailyData}
          kpiTarget={kpiTarget}
          daysElapsed={daysElapsed}
          totalDays={totalDays}
          followerTotals={{
            threadsCurrent: data.followerBreakdown.find((item) => item.platform === 'threads')?.count ?? 0,
            instagramCurrent: data.followerBreakdown.find((item) => item.platform === 'instagram')?.count ?? 0,
            threadsStart: data.followerStarts.threads,
            instagramStart: data.followerStarts.instagram,
          }}
        />
      )}
    </div>
  );
}
