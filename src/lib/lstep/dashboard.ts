import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient } from '@/lib/bigquery';

const DEFAULT_DATASET = process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep';

interface DailyMetric {
  date: string;
  count: number;
}

interface TopEntity {
  name: string;
  count: number;
}

interface FunnelStage {
  stage: string;
  users: number;
}

export interface LineDashboardData {
  dailyNewFriends: DailyMetric[];
  topTags: TopEntity[];
  topSources: TopEntity[];
  funnel: FunnelStage[];
  latestSnapshotDate: string | null;
}

function parseFunnelStages(): string[] {
  const raw = process.env.LSTEP_FUNNEL_TAGS;
  if (!raw) {
    return ['IG×LN：流入', 'IG×LN：詳細F済', 'IG×LN：成約'];
  }
  return raw
    .split('|')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export async function getLineDashboardData(projectId: string): Promise<LineDashboardData> {
  const datasetId = DEFAULT_DATASET;
  if (!datasetId) {
    throw new Error('Lstep用の BigQuery データセット名が取得できません (LSTEP_BQ_DATASET)');
  }

  const client = createBigQueryClient(projectId, process.env.LSTEP_BQ_LOCATION);

  const [latestSnapshot] = await runQuery<{ snapshot_date: string | null }>(client, projectId, datasetId, {
    query: `SELECT MAX(snapshot_date) AS snapshot_date FROM user_core`,
  });

  const latestSnapshotDate = latestSnapshot?.snapshot_date ?? null;

  const dailyNewFriends = await runQuery<{ snapshot_date: string; new_friends: number }>(
    client,
    projectId,
    datasetId,
    {
      query: `
        SELECT
          snapshot_date,
          COUNT(DISTINCT user_id) AS new_friends
        FROM user_core
        GROUP BY snapshot_date
        ORDER BY snapshot_date DESC
        LIMIT @limit
      `,
      params: { limit: 14 },
    },
  );

  const topTags = await runQuery<{ tag_name: string | null; user_count: number }>(client, projectId, datasetId, {
    query: `
      WITH latest AS (
        SELECT MAX(snapshot_date) AS snapshot_date FROM user_tags
      )
      SELECT
        tag_name,
        SUM(CASE WHEN has_tag THEN 1 ELSE 0 END) AS user_count
      FROM user_tags
      WHERE has_tag = true
        AND snapshot_date = (SELECT snapshot_date FROM latest)
      GROUP BY tag_name
      ORDER BY user_count DESC
      LIMIT 10
    `,
  });

  const topSources = await runQuery<{ tag_name: string | null; user_count: number }>(
    client,
    projectId,
    datasetId,
    {
      query: `
        WITH latest AS (
          SELECT MAX(snapshot_date) AS snapshot_date FROM user_tags
        )
        SELECT
          tag_name,
          SUM(CASE WHEN has_tag THEN 1 ELSE 0 END) AS user_count
        FROM user_tags
        WHERE has_tag = true
          AND snapshot_date = (SELECT snapshot_date FROM latest)
          AND (tag_name LIKE '%流入経路%' OR tag_name LIKE '%Instagram%' OR tag_name LIKE '%Threads%')
        GROUP BY tag_name
        ORDER BY user_count DESC
        LIMIT 10
      `,
    },
  );

  const funnel = await buildFunnel(client, projectId, datasetId);

  return {
    latestSnapshotDate,
    dailyNewFriends: dailyNewFriends
      .map((row) => ({ date: row.snapshot_date, count: Number(row.new_friends ?? 0) }))
      .reverse(),
    topTags: topTags.map((row) => ({ name: row.tag_name ?? '不明', count: Number(row.user_count ?? 0) })),
    topSources: topSources.map((row) => ({ name: row.tag_name ?? '不明', count: Number(row.user_count ?? 0) })),
    funnel,
  };
}

async function buildFunnel(client: BigQuery, projectId: string, datasetId: string): Promise<FunnelStage[]> {
  const stages = parseFunnelStages();
  if (stages.length === 0) {
    return [];
  }

  const stageParams = stages.reduce<Record<string, string>>((acc, stage, index) => {
    acc[`stage${index + 1}`] = stage;
    return acc;
  }, {});

  const selectExpressions = stages
    .map(
      (_, index) =>
        `MAX(IF(tag_name = @stage${index + 1}, IF(has_tag, 1, 0), 0)) AS stage${index + 1}_flag`,
    )
    .join(',\n        ');

  const cumulativeExpressions = stages
    .map((_, index) => {
      if (index === 0) {
        return `SUM(stage1_flag) AS stage1_users`;
      }
      const prevCondition = Array.from({ length: index + 1 }, (_, innerIndex) => `stage${innerIndex + 1}_flag = 1`).join(
        ' AND ',
      );
      return `SUM(CASE WHEN ${prevCondition} THEN 1 ELSE 0 END) AS stage${index + 1}_users`;
    })
    .join(',\n      ');

  const query = `
    WITH latest AS (
      SELECT MAX(snapshot_date) AS snapshot_date FROM user_tags
    ),
    flags AS (
      SELECT
        user_id,
        ${selectExpressions}
      FROM user_tags
      WHERE snapshot_date = (SELECT snapshot_date FROM latest)
      GROUP BY user_id
    )
    SELECT
      ${cumulativeExpressions}
    FROM flags
  `;

  const [row] = await runQuery<Record<string, number | null>>(client, projectId, datasetId, {
    query,
    params: stageParams,
  });

  if (!row) {
    return stages.map((stage) => ({ stage, users: 0 }));
  }

  return stages.map((stage, index) => {
    const value = row[`stage${index + 1}_users`] ?? 0;
    return {
      stage,
      users: Number(value) || 0,
    };
  });
}

interface QueryOptions {
  query: string;
  params?: Record<string, unknown>;
}

async function runQuery<T extends Record<string, unknown>>(
  client: BigQuery,
  projectId: string,
  datasetId: string,
  options: QueryOptions,
): Promise<T[]> {
  const [rows] = await client.query({
    query: options.query,
    params: options.params,
    useLegacySql: false,
    defaultDataset: {
      projectId,
      datasetId,
    },
  });

  return rows as T[];
}
