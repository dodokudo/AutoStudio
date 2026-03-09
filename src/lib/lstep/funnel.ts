import { createBigQueryClient } from '@/lib/bigquery';
import { randomUUID } from 'crypto';

// 型定義とプリセット定数はClient-safeなファイルから再エクスポート
export type { FunnelStep, FunnelDefinition, FunnelStepResult, FunnelAnalysisResult } from './funnel-types';
export { PRESET_FUNNEL_IGLN, PRESET_FUNNEL_SURVEY, PRESET_FUNNEL_3M, PRESET_FUNNELS } from './funnel-types';

import type { FunnelStep, FunnelDefinition, FunnelAnalysisResult, FunnelStepResult } from './funnel-types';
import { PRESET_FUNNEL_IGLN, PRESET_FUNNEL_SURVEY, PRESET_FUNNEL_3M } from './funnel-types';

const DEFAULT_DATASET = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';
const TABLE_NAME = 'lstep_friends_raw';
const FUNNEL_DEFINITIONS_TABLE = 'line_funnel_definitions';

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
    /** 新規/既存フィルタ */
    segmentFilter?: 'all' | 'new' | 'existing';
    /** この日付より前の登録=既存、以降=新規 (YYYY-MM-DD) */
    segmentCutoffDate?: string;
  }
): Promise<FunnelAnalysisResult> {
  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);
  const datasetId = DEFAULT_DATASET;

  // 日付フィルタ条件を構築（JOINのため t. エイリアス必須）
  const dateFilter = options?.startDate && options?.endDate
    ? 'AND DATE(TIMESTAMP(t.friend_added_at), "Asia/Tokyo") BETWEEN @startDate AND @endDate'
    : '';

  // 新規/既存フィルタ条件を構築
  const segmentFilterClause = (() => {
    const filter = options?.segmentFilter;
    const cutoff = options?.segmentCutoffDate;
    if (!filter || filter === 'all' || !cutoff) return '';
    if (filter === 'new') return 'AND DATE(TIMESTAMP(t.friend_added_at), "Asia/Tokyo") >= @segmentCutoffDate';
    if (filter === 'existing') return 'AND DATE(TIMESTAMP(t.friend_added_at), "Asia/Tokyo") < @segmentCutoffDate';
    return '';
  })();

  // BigQueryパラメータを構築（undefinedを除外）
  const buildParams = () => {
    const params: Record<string, string> = {};
    if (options?.startDate) params.startDate = options.startDate;
    if (options?.endDate) params.endDate = options.endDate;
    if (options?.segmentFilter && options.segmentFilter !== 'all' && options?.segmentCutoffDate) {
      params.segmentCutoffDate = options.segmentCutoffDate;
    }
    return params;
  };

  // 最新スナップショットをJOINで常に取得（staleデータ防止）
  const latestJoinCTE = `
    WITH latest AS (
      SELECT MAX(snapshot_date) AS sd
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\`
    )`;

  // 計測対象の総数を取得
  const [totalRows] = await client.query({
    query: `
      ${latestJoinCTE}
      SELECT COUNT(DISTINCT t.id) AS total
      FROM \`${projectId}.${datasetId}.${TABLE_NAME}\` t
      JOIN latest l ON t.snapshot_date = l.sd
      WHERE t.friend_added_at IS NOT NULL
        AND t.blocked = 0
        ${dateFilter}
        ${segmentFilterClause}
    `,
    params: buildParams(),
  });

  const totalBase = Number((totalRows[0] as { total: number }).total);

  if (totalBase === 0 && !options?.segmentFilter) {
    throw new Error('No snapshot data available');
  }

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
          ${latestJoinCTE}
          SELECT COUNT(DISTINCT CASE WHEN t.\`${step.tagColumn}\` = 1 THEN t.id END) AS reached
          FROM \`${projectId}.${datasetId}.${TABLE_NAME}\` t
          JOIN latest l ON t.snapshot_date = l.sd
          WHERE t.friend_added_at IS NOT NULL
            AND t.blocked = 0
            ${dateFilter}
            ${segmentFilterClause}
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
  if (funnelId === '3m') return PRESET_FUNNEL_3M;

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
  if (funnelId === 'igln' || funnelId === 'survey' || funnelId === '3m') {
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
    // Threads ファネル (TH:)
    th_video_watched: 'TH：動画閲覧',
    th_video_lp: 'TH：動画LP遷移',
    th_consultation_form: 'TH：個別相談フォーム遷移',
    th_consultation_applied: 'TH：個別相談申込済み',
    th_contracted: 'TH：成約',
    // TAI ファネル (TAI:)
    tai_lp: 'TAI：動画LP遷移',
    tai: 'TAI：動画閲覧',
    tai_video_watched: 'TAI：動画閲覧',
    tai_personal_applied: 'TAI：個別申込ページ遷移',
    tai_personal: 'TAI：個別相談会申込済み',
    tai_consultation_applied: 'TAI：個別相談会申込済み',
    tai_personal_done: 'TAI：個別相談会実施',
    tai_consultation_done: 'TAI：個別相談会実施',
    tai_contracted: 'TAI：成約',
    // 3月ローンチ (3M:) — BQではautodetectで先頭_が除去されるため3m_始まり
    '3m_video_lp': '3M：動画LP遷移',
    '3m_survey_completed': '3M：アンケート回答済み',
    '3m_seminar_form': '3M：セミナーフォーム遷移',
    '3m_seminar_applied': '3M：セミナー申込済み',
    '3m_seminar_joined': '3M：セミナー参加',
    '3m_bonus_received': '3M：参加特典受け取り',
    '3m_fe_purchased': '3M：FE購入',
    '3m_be_purchased': '3M：BE購入',
    // アンケート
    survey_form_inflow: 'アンケートフォーム流入',
    survey_completed: 'アンケート回答完了',
    // 流入経路
    source_threads: '流入：Threads',
    source_threads_post: '流入：Threads ポスト',
    source_threads_profile: '流入：Threads プロフ',
    source_threads_fixed: '流入：Threads 固定',
    source_instagram: '流入：Instagram',
    source_instagram_profile: '流入：Instagram プロフ',
    source_instagram_comment: '流入：Instagram コメント',
    source_youtube: '流入：YouTube',
    inflow_organic: '流入：オーガニック',
    // 属性
    gender_male: '性別：男性',
    gender_female: '性別：女性',
  };

  return labelMap[column] ?? column;
}
