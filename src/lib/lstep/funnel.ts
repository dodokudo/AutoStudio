import { createBigQueryClient } from '@/lib/bigquery';

const DEFAULT_DATASET = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';
const TABLE_NAME = 'lstep_friends_raw';

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

/**
 * カスタムファネル分析を実行
 */
export async function analyzeFunnel(
  projectId: string,
  funnelDefinition: FunnelDefinition,
  options?: {
    startDate?: string;
    endDate?: string;
    snapshotDate?: string;
  }
): Promise<FunnelAnalysisResult> {
  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);
  const datasetId = DEFAULT_DATASET;

  // 最新のスナップショット日付を取得（指定がない場合）
  let snapshotDate = options?.snapshotDate;
  if (!snapshotDate) {
    const [latestSnapshot] = await client.query({
      query: `SELECT CAST(MAX(snapshot_date) AS STRING) AS snapshot_date FROM \`${projectId}.${datasetId}.${TABLE_NAME}\``,
    });
    snapshotDate = (latestSnapshot[0] as { snapshot_date: string })?.snapshot_date;
  }

  if (!snapshotDate) {
    throw new Error('No snapshot data available');
  }

  // 日付フィルタ条件を構築
  const dateFilter = options?.startDate && options?.endDate
    ? 'AND DATE(friend_added_at) BETWEEN @startDate AND @endDate'
    : '';

  // BigQueryパラメータを構築（undefinedを除外）
  const buildParams = () => {
    const params: Record<string, string> = { snapshotDate };
    if (options?.startDate) params.startDate = options.startDate;
    if (options?.endDate) params.endDate = options.endDate;
    return params;
  };

  // 計測対象の総数を取得
  const [totalRows] = await client.query({
    query: `
      SELECT COUNT(DISTINCT id) AS total
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
      WHERE snapshot_date = @snapshotDate
        AND friend_added_at IS NOT NULL
        ${dateFilter}
    `,
    params: buildParams(),
  });

  const totalBase = Number((totalRows[0] as { total: number }).total);

  // 各ステップの到達人数を取得
  const stepResults: FunnelStepResult[] = [];
  let previousReached = totalBase;

  for (let i = 0; i < funnelDefinition.steps.length; i++) {
    const step = funnelDefinition.steps[i];

    let reached: number;

    // 最初のステップ（計測対象）の場合は全体数を使用
    if (i === 0 || step.id === 'measure_target') {
      reached = totalBase;
    } else {
      const [rows] = await client.query({
        query: `
          SELECT COUNT(DISTINCT CASE WHEN \`${step.tagColumn}\` = 1 THEN id END) AS reached
          FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
          WHERE snapshot_date = @snapshotDate
            AND friend_added_at IS NOT NULL
            ${dateFilter}
        `,
        params: buildParams(),
      });

      reached = Number((rows[0] as { reached: number }).reached);
    }

    const notReached = previousReached - reached;
    const conversionRate = previousReached > 0 ? (reached / previousReached) * 100 : 0;
    const overallRate = totalBase > 0 ? (reached / totalBase) * 100 : 0;

    stepResults.push({
      stepId: step.id,
      label: step.label,
      reached,
      notReached,
      conversionRate,
      overallRate,
    });

    previousReached = reached;
  }

  return {
    definition: funnelDefinition,
    totalBase,
    steps: stepResults,
    dateRange: options?.startDate && options?.endDate
      ? { start: options.startDate, end: options.endDate }
      : undefined,
  };
}

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
