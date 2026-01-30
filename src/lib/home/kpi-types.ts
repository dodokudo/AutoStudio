/**
 * KPI目標関連の型定義と計算ユーティリティ
 * クライアント/サーバー両方で使用可能
 */

// ============================================================
// 型定義
// ============================================================

/** KPI目標入力型 */
export interface KpiTargetInput {
  targetMonth: string; // 'YYYY-MM'
  workingDays: number;
  targetRevenue: number;
  targetLineRegistrations: number;
  targetSeminarParticipants: number;
  targetFrontendPurchases: number;
  targetBackendPurchases: number;
  targetThreadsFollowers: number;
  targetInstagramFollowers: number;
}

/** KPI目標（DB保存型） */
export interface KpiTarget extends KpiTargetInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/** デイリー目標（計算値） */
export interface DailyTargets {
  dailyRevenue: number;
  dailyLineRegistrations: number;
  dailySeminarParticipants: number;
  dailyFrontendPurchases: number;
  dailyBackendPurchases: number;
}

/** 必要転換率（計算値） */
export interface RequiredConversionRates {
  lineToSeminar: number;
  seminarToFrontend: number;
  frontendToBackend: number;
  lineToBackend: number;
}

/** KPI進捗状況 */
export interface KpiProgress {
  metric: string;
  label: string;
  actual: number;
  target: number;
  achievementRate: number;
  paceStatus: 'on_track' | 'behind' | 'ahead';
}

/** 今月サマリー */
export interface MonthlySummary {
  revenue: KpiProgress;
  lineRegistrations: KpiProgress;
  seminarParticipants: KpiProgress;
  frontendPurchases: KpiProgress;
  backendPurchases: KpiProgress;
}

/** ペース予測 */
export interface PacePrediction {
  metric: string;
  label: string;
  currentActual: number;
  projectedMonthEnd: number;
  target: number;
  projectedAchievementRate: number;
  remainingDays: number;
  requiredDailyRate: number;
}

// ============================================================
// 計算ユーティリティ
// ============================================================

/** デイリー目標を計算 */
export function calculateDailyTargets(target: KpiTargetInput): DailyTargets {
  const { workingDays } = target;
  if (workingDays <= 0) {
    return {
      dailyRevenue: 0,
      dailyLineRegistrations: 0,
      dailySeminarParticipants: 0,
      dailyFrontendPurchases: 0,
      dailyBackendPurchases: 0,
    };
  }
  return {
    dailyRevenue: target.targetRevenue / workingDays,
    dailyLineRegistrations: target.targetLineRegistrations / workingDays,
    dailySeminarParticipants: target.targetSeminarParticipants / workingDays,
    dailyFrontendPurchases: target.targetFrontendPurchases / workingDays,
    dailyBackendPurchases: target.targetBackendPurchases / workingDays,
  };
}

/** 必要転換率を計算 */
export function calculateRequiredRates(target: KpiTargetInput): RequiredConversionRates {
  const safeDiv = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0);
  return {
    lineToSeminar: safeDiv(target.targetSeminarParticipants, target.targetLineRegistrations),
    seminarToFrontend: safeDiv(target.targetFrontendPurchases, target.targetSeminarParticipants),
    frontendToBackend: safeDiv(target.targetBackendPurchases, target.targetFrontendPurchases),
    lineToBackend: safeDiv(target.targetBackendPurchases, target.targetLineRegistrations),
  };
}

/** 達成率を計算 */
export function calculateAchievementRate(actual: number, target: number): number {
  if (target <= 0) return 0;
  return (actual / target) * 100;
}

/** ペースステータスを判定 */
export function getPaceStatus(
  actual: number,
  target: number,
  daysElapsed: number,
  totalDays: number
): 'on_track' | 'behind' | 'ahead' {
  if (totalDays <= 0 || daysElapsed <= 0) return 'on_track';
  const expectedProgress = (daysElapsed / totalDays) * target;
  const margin = 0.1; // 10%のマージン
  if (actual >= expectedProgress * (1 + margin)) return 'ahead';
  if (actual <= expectedProgress * (1 - margin)) return 'behind';
  return 'on_track';
}

/** デフォルトのKPI目標を返す */
export function getDefaultKpiTarget(month: string): KpiTargetInput {
  return {
    targetMonth: month,
    workingDays: 20,
    targetRevenue: 0,
    targetLineRegistrations: 0,
    targetSeminarParticipants: 0,
    targetFrontendPurchases: 0,
    targetBackendPurchases: 0,
    targetThreadsFollowers: 0,
    targetInstagramFollowers: 0,
  };
}
