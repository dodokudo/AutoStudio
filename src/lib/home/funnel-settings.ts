import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_home';
const TABLE = 'home_funnel_settings';

export interface HomeFunnelSettings {
  selectedFunnelId: string | null;
  hiddenStepsByFunnel: Record<string, string[]>;
}

async function ensureHomeFunnelSettingsTable(): Promise<void> {
  const client = createBigQueryClient(PROJECT_ID);
  const dataset = client.dataset(DATASET);

  try {
    await dataset.create({ location: 'US' });
  } catch (err: unknown) {
    const error = err as { code?: number };
    if (error.code !== 409) throw err;
  }

  try {
    await dataset.createTable(TABLE, {
      schema: {
        fields: [
          { name: 'id', type: 'STRING', mode: 'REQUIRED' },
          { name: 'selected_funnel_id', type: 'STRING', mode: 'NULLABLE' },
          { name: 'hidden_steps_json', type: 'STRING', mode: 'NULLABLE' },
          { name: 'created_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
          { name: 'updated_at', type: 'TIMESTAMP', mode: 'REQUIRED' },
        ],
      },
    });
  } catch (err: unknown) {
    const error = err as { code?: number };
    if (error.code !== 409) throw err;
  }
}

export async function getHomeFunnelSettings(): Promise<HomeFunnelSettings> {
  await ensureHomeFunnelSettingsTable();
  const client = createBigQueryClient(PROJECT_ID);

  const [rows] = await client.query({
    query: `
      SELECT selected_funnel_id, hidden_steps_json
      FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
      WHERE id = 'default'
      LIMIT 1
    `,
  });

  if (!rows || rows.length === 0) {
    return { selectedFunnelId: null, hiddenStepsByFunnel: {} };
  }

  const row = rows[0] as Record<string, unknown>;
  const hiddenJson = typeof row.hidden_steps_json === 'string' ? row.hidden_steps_json : '';
  let hiddenStepsByFunnel: Record<string, string[]> = {};
  if (hiddenJson) {
    try {
      hiddenStepsByFunnel = JSON.parse(hiddenJson) as Record<string, string[]>;
    } catch {
      hiddenStepsByFunnel = {};
    }
  }

  return {
    selectedFunnelId: row.selected_funnel_id ? String(row.selected_funnel_id) : null,
    hiddenStepsByFunnel,
  };
}

export async function saveHomeFunnelSettings(input: HomeFunnelSettings): Promise<HomeFunnelSettings> {
  await ensureHomeFunnelSettingsTable();
  const client = createBigQueryClient(PROJECT_ID);

  const hiddenJson = JSON.stringify(input.hiddenStepsByFunnel ?? {});

  await client.query({
    query: `
      MERGE \`${PROJECT_ID}.${DATASET}.${TABLE}\` T
      USING (
        SELECT
          'default' as id,
          @selectedFunnelId as selected_funnel_id,
          @hiddenStepsJson as hidden_steps_json,
          CURRENT_TIMESTAMP() as created_at,
          CURRENT_TIMESTAMP() as updated_at
      ) S
      ON T.id = S.id
      WHEN MATCHED THEN
        UPDATE SET
          selected_funnel_id = S.selected_funnel_id,
          hidden_steps_json = S.hidden_steps_json,
          updated_at = S.updated_at
      WHEN NOT MATCHED THEN
        INSERT (id, selected_funnel_id, hidden_steps_json, created_at, updated_at)
        VALUES (S.id, S.selected_funnel_id, S.hidden_steps_json, S.created_at, S.updated_at)
    `,
    params: {
      selectedFunnelId: input.selectedFunnelId,
      hiddenStepsJson: hiddenJson,
    },
  });

  return input;
}
