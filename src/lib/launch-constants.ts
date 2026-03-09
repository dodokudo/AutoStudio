/**
 * 3月ローンチ共通定数
 * KpiDashboard.tsx, sync-tags/route.ts 等が参照する一元管理値
 */

/** 既存/新規LINE分割の基準日（この日以降 = 新規） */
export const SEGMENT_CUTOFF_DATE = '2026-03-08';

/** BigQueryデータセット */
export const LSTEP_DATASET = process.env.LSTEP_BQ_DATASET || 'autostudio_lstep';
