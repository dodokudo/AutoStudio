'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { dashboardCardClass } from '@/components/dashboard/styles';
import type { HomeDashboardData } from '@/lib/home/dashboard';
import type { KpiTarget } from '@/lib/home/kpi-types';
import { calculateAchievementRate, getPaceStatus } from '@/lib/home/kpi-types';
import { MonthlySummaryCards } from './MonthlySummaryCards';
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
    `/api/home/monthly-actuals?month=${currentMonth}&daily=true`,
    fetcher,
    { refreshInterval: 60000 } // 1分ごとに更新
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
    return actualsResponse?.data?.daily ?? [];
  }, [actualsResponse]);

  // KPI進捗計算
  const summaryData = useMemo(() => {
    const targetRevenue = kpiTarget?.targetRevenue ?? 0;
    const targetLine = kpiTarget?.targetLineRegistrations ?? 0;
    const targetFrontend = kpiTarget?.targetFrontendPurchases ?? 0;
    const targetBackend = kpiTarget?.targetBackendPurchases ?? 0;

    const safePace = (actual: number, target: number) => {
      if (target <= 0) return 'on_track' as const;
      return getPaceStatus(actual, target, daysElapsed, totalDays);
    };

    return {
      revenue: {
        metric: 'revenue',
        label: '売上',
        actual: actuals.revenue,
        target: targetRevenue,
        achievementRate: calculateAchievementRate(actuals.revenue, targetRevenue),
        paceStatus: safePace(actuals.revenue, targetRevenue),
      },
      lineRegistrations: {
        metric: 'lineRegistrations',
        label: 'LINE登録',
        actual: actuals.lineRegistrations,
        target: targetLine,
        achievementRate: calculateAchievementRate(actuals.lineRegistrations, targetLine),
        paceStatus: safePace(actuals.lineRegistrations, targetLine),
      },
      frontendPurchases: {
        metric: 'frontendPurchases',
        label: 'フロント購入',
        actual: actuals.frontendPurchases,
        target: targetFrontend,
        achievementRate: calculateAchievementRate(actuals.frontendPurchases, targetFrontend),
        paceStatus: safePace(actuals.frontendPurchases, targetFrontend),
      },
      backendPurchases: {
        metric: 'backendPurchases',
        label: 'バックエンド',
        actual: actuals.backendPurchases,
        target: targetBackend,
        achievementRate: calculateAchievementRate(actuals.backendPurchases, targetBackend),
        paceStatus: safePace(actuals.backendPurchases, targetBackend),
      },
    };
  }, [kpiTarget, actuals, daysElapsed, totalDays]);

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

      {/* 今月サマリー */}
      <MonthlySummaryCards summary={summaryData} />

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

      {/* 今月ペース予測 */}
      {pacePredictions && (
        <PacePredictionCard
          predictions={pacePredictions}
          daysElapsed={daysElapsed}
          totalDays={totalDays}
        />
      )}

      {/* LINE登録流入元別 */}
      <LineSourceBreakdown data={lineSourceData} />

      {/* ファネル（ホーム専用表示） */}
      <HomeFunnelPanel startDate={data.period.start} endDate={data.period.end} />

      {/* デイリー推移グラフ */}
      <DailyTrendChart data={dailyData} />

      {/* デイリー詳細テーブル */}
      <DailyDetailsTable
        data={dailyData}
        kpiTarget={kpiTarget}
      />
    </div>
  );
}
