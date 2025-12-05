import { createBigQueryClient } from '@/lib/bigquery';
import { randomUUID } from 'crypto';

const DEFAULT_DATASET = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';
const TABLE_NAME = 'lstep_friends_raw';
const FUNNEL_DEFINITIONS_TABLE = 'line_funnel_definitions';

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

// =============================================================================
// ファネル定義の永続化（CRUD）
// =============================================================================

/**
 * ファネル定義テーブルを作成（存在しない場合）
 */
async function ensureFunnelDefinitionsTable(
  projectId: string,
  datasetId: string = DEFAULT_DATASET,
): Promise<void> {
  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);
  const dataset = client.dataset(datasetId);
  const table = dataset.table(FUNNEL_DEFINITIONS_TABLE);

  const [exists] = await table.exists();
  if (exists) return;

  await table.create({
    schema: {
      fields: [
        { name: 'id', type: 'STRING', mode: 'REQUIRED' },
        { name: 'name', type: 'STRING', mode: 'REQUIRED' },
        { name: 'description', type: 'STRING', mode: 'NULLABLE' },
        { name: 'steps_json', type: 'STRING', mode: 'REQUIRED' },
        { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
        { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
      ],
    },
  });
}

/**
 * 保存されたファネル定義一覧を取得
 */
export async function listFunnelDefinitions(
  projectId: string,
  datasetId: string = DEFAULT_DATASET,
): Promise<FunnelDefinition[]> {
  await ensureFunnelDefinitionsTable(projectId, datasetId);

  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);
  const [rows] = await client.query({
    query: `
      SELECT id, name, description, steps_json, created_at
      FROM \`${projectId}.${datasetId}.${FUNNEL_DEFINITIONS_TABLE}\`
      ORDER BY created_at DESC
    `,
  });

  return (rows as Array<{
    id: string;
    name: string;
    description: string | null;
    steps_json: string;
    created_at: { value: string } | string;
  }>).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    steps: JSON.parse(row.steps_json) as FunnelStep[],
    createdAt: typeof row.created_at === 'object' ? row.created_at.value : row.created_at,
  }));
}

/**
 * ファネル定義を取得
 */
export async function getFunnelDefinition(
  projectId: string,
  funnelId: string,
  datasetId: string = DEFAULT_DATASET,
): Promise<FunnelDefinition | null> {
  // プリセットをチェック
  if (funnelId === 'igln') return PRESET_FUNNEL_IGLN;
  if (funnelId === 'survey') return PRESET_FUNNEL_SURVEY;

  await ensureFunnelDefinitionsTable(projectId, datasetId);

  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);
  const [rows] = await client.query({
    query: `
      SELECT id, name, description, steps_json, created_at
      FROM \`${projectId}.${datasetId}.${FUNNEL_DEFINITIONS_TABLE}\`
      WHERE id = @funnelId
      LIMIT 1
    `,
    params: { funnelId },
  });

  const typedRows = rows as Array<{
    id: string;
    name: string;
    description: string | null;
    steps_json: string;
    created_at: { value: string } | string;
  }>;

  if (typedRows.length === 0) return null;

  const row = typedRows[0];
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    steps: JSON.parse(row.steps_json) as FunnelStep[],
    createdAt: typeof row.created_at === 'object' ? row.created_at.value : row.created_at,
  };
}

/**
 * ファネル定義を保存（作成・更新）
 */
export async function saveFunnelDefinition(
  projectId: string,
  input: {
    id?: string;
    name: string;
    description?: string;
    steps: FunnelStep[];
  },
  datasetId: string = DEFAULT_DATASET,
): Promise<FunnelDefinition> {
  await ensureFunnelDefinitionsTable(projectId, datasetId);

  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);
  const now = new Date().toISOString();
  const funnelId = input.id ?? randomUUID();

  // 既存レコードを削除（upsert）
  if (input.id) {
    await client.query({
      query: `
        DELETE FROM \`${projectId}.${datasetId}.${FUNNEL_DEFINITIONS_TABLE}\`
        WHERE id = @funnelId
      `,
      params: { funnelId },
    });
  }

  // 新規挿入
  await client.query({
    query: `
      INSERT INTO \`${projectId}.${datasetId}.${FUNNEL_DEFINITIONS_TABLE}\`
      (id, name, description, steps_json, created_at, updated_at)
      VALUES (@id, @name, @description, @stepsJson, @createdAt, @updatedAt)
    `,
    params: {
      id: funnelId,
      name: input.name,
      description: input.description ?? null,
      stepsJson: JSON.stringify(input.steps),
      createdAt: now,
      updatedAt: now,
    },
  });

  return {
    id: funnelId,
    name: input.name,
    description: input.description,
    steps: input.steps,
    createdAt: now,
  };
}

/**
 * ファネル定義を削除
 */
export async function deleteFunnelDefinition(
  projectId: string,
  funnelId: string,
  datasetId: string = DEFAULT_DATASET,
): Promise<boolean> {
  // プリセットは削除不可
  if (funnelId === 'igln' || funnelId === 'survey') {
    throw new Error('プリセットファネルは削除できません');
  }

  await ensureFunnelDefinitionsTable(projectId, datasetId);

  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);
  await client.query({
    query: `
      DELETE FROM \`${projectId}.${datasetId}.${FUNNEL_DEFINITIONS_TABLE}\`
      WHERE id = @funnelId
    `,
    params: { funnelId },
  });

  return true;
}

/**
 * 利用可能なタグカラム一覧を取得
 */
export async function getAvailableTagColumns(
  projectId: string,
  datasetId: string = DEFAULT_DATASET,
): Promise<Array<{ column: string; label: string }>> {
  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);

  // テーブルスキーマからINTEGER型カラムを取得（タグカラムはフラグなのでINTEGER）
  const [metadata] = await client.dataset(datasetId).table(TABLE_NAME).getMetadata();
  const schema = metadata.schema as { fields: Array<{ name: string; type: string }> };

  // 除外するシステムカラム
  const excludeColumns = new Set([
    'snapshot_date', 'id', 'display_name', 'friend_added_at', 'blocked',
    'last_msg_at', 'scenario_name', 'scenario_days',
  ]);

  // INTEGER型でシステムカラム以外のもの
  const tagColumns = schema.fields
    .filter((field) => field.type === 'INTEGER' && !excludeColumns.has(field.name))
    .map((field) => ({
      column: field.name,
      label: formatColumnLabel(field.name),
    }));

  return tagColumns;
}

/**
 * カラム名を日本語ラベルに変換
 */
function formatColumnLabel(column: string): string {
  const labelMap: Record<string, string> = {
    th_video_watched: '動画閲覧',
    th_video_lp: '動画LP遷移',
    th_consultation_form: '個別相談フォーム遷移',
    th_consultation_applied: '個別相談申込済み',
    th_contracted: '成約',
    survey_form_inflow: 'アンケートフォーム流入',
    survey_completed: 'アンケート回答完了',
    source_threads: '流入：Threads',
    source_threads_post: '流入：Threads ポスト',
    source_threads_profile: '流入：Threads プロフ',
    source_threads_fixed: '流入：Threads 固定',
    source_instagram: '流入：Instagram',
    source_instagram_profile: '流入：Instagram プロフ',
    source_instagram_comment: '流入：Instagram コメント',
    source_youtube: '流入：YouTube',
    inflow_organic: '流入：オーガニック',
    gender_male: '性別：男性',
    gender_female: '性別：女性',
  };

  return labelMap[column] ?? column;
}
