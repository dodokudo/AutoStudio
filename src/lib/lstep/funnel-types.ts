/**
 * ファネル型定義とプリセット定数
 * Client Component から安全にimport可能（BigQuery等のサーバー依存なし）
 */

/**
 * ファネルステップの定義
 */
export interface FunnelStep {
  /** ステップの識別子 */
  id: string;
  /** ステップの表示名 */
  label: string;
  /** タグカラム名 */
  tagColumn: string;
}

/**
 * ファネル定義
 */
export interface FunnelDefinition {
  /** ファネルID */
  id: string;
  /** ファネル名 */
  name: string;
  /** ファネルの説明 */
  description?: string;
  /** ファネルステップのリスト（順序通り） */
  steps: FunnelStep[];
  /** 作成日時 */
  createdAt?: string;
}

/**
 * ファネルステップの結果
 */
export interface FunnelStepResult {
  /** ステップID */
  stepId: string;
  /** ステップ名 */
  label: string;
  /** 到達人数 */
  reached: number;
  /** 未到達人数（前のステップからのドロップオフ） */
  notReached: number;
  /** 移行率（前のステップからの到達率） */
  conversionRate: number;
  /** 全体比（計測対象全体に対する割合） */
  overallRate: number;
}

/**
 * ファネル分析結果
 */
export interface FunnelAnalysisResult {
  /** ファネル定義 */
  definition: FunnelDefinition;
  /** 計測対象の総数 */
  totalBase: number;
  /** 各ステップの結果 */
  steps: FunnelStepResult[];
  /** 分析対象の日付範囲 */
  dateRange?: {
    start: string;
    end: string;
  };
}

// =============================================================================
// プリセットファネル定義
// =============================================================================

/**
 * プリセットファネル定義: Threads ファネル
 */
export const PRESET_FUNNEL_IGLN: FunnelDefinition = {
  id: 'igln',
  name: 'Threads ファネル分析',
  description: 'LINE登録からアンケート回答、動画視聴、個別相談、成約までのファネル',
  steps: [
    { id: 'measure_target', label: '計測対象', tagColumn: 'friend_added_at' },
    { id: 'survey_completed', label: 'アンケート回答完了', tagColumn: 'survey_completed' },
    { id: 'video_lp', label: '動画LP遷移', tagColumn: 'th_video_lp' },
    { id: 'video_watched', label: '動画閲覧', tagColumn: 'th_video_watched' },
    { id: 'consultation_form', label: '個別相談フォーム遷移', tagColumn: 'th_consultation_form' },
    { id: 'consultation_applied', label: '個別相談申込済み', tagColumn: 'th_consultation_applied' },
    { id: 'contracted', label: '成約', tagColumn: 'th_contracted' },
  ],
};

/**
 * プリセットファネル定義: アンケート回答
 */
export const PRESET_FUNNEL_SURVEY: FunnelDefinition = {
  id: 'survey',
  name: 'アンケート回答',
  description: 'LINE登録からアンケート完了までのファネル',
  steps: [
    { id: 'measure_target', label: '計測対象', tagColumn: 'friend_added_at' },
    { id: 'survey_entered', label: 'アンケート回答', tagColumn: 'survey_form_inflow' },
  ],
};

/**
 * プリセットファネル定義: 3月ローンチ
 */
export const PRESET_FUNNEL_3M: FunnelDefinition = {
  id: '3m',
  name: '3月ローンチ',
  description: '2026年3月ローンチ（特典配布→セミナー→FE→BE）',
  steps: [
    { id: 'base', label: '計測対象', tagColumn: '_base' },
    { id: 'survey', label: 'アンケート回答', tagColumn: 'survey_completed' },
    { id: 'video_lp', label: '動画LP閲覧', tagColumn: '3m_lp' },
    { id: 'seminar_form', label: 'セミナーフォーム遷移', tagColumn: '3m_3' },
    { id: 'seminar_applied', label: 'セミナー申込済み', tagColumn: '3m_done' },
    { id: 'fe_purchased', label: 'FE購入', tagColumn: '3m_fe' },
    { id: 'be_purchased', label: 'BE購入', tagColumn: '3m_be' },
  ],
};

/**
 * 全プリセットファネル一覧
 */
export const PRESET_FUNNELS: FunnelDefinition[] = [
  PRESET_FUNNEL_IGLN,
  PRESET_FUNNEL_SURVEY,
  PRESET_FUNNEL_3M,
];
