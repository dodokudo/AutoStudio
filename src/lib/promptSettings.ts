import type { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient, resolveProjectId } from './bigquery';

const DATASET = 'autostudio_threads';
const PROJECT_ID = resolveProjectId();
const TABLE = 'threads_prompt_settings';

export const THREADS_PROMPT_TYPES = ['ai-tips', 'threads-operation'] as const;
export type ThreadsPromptType = (typeof THREADS_PROMPT_TYPES)[number];

export interface PromptRow {
  prompt_type: ThreadsPromptType;
  version: number;
  prompt_text: string;
  created_at: string;
}

const client: BigQuery = createBigQueryClient(PROJECT_ID);
let ensureTablePromise: Promise<void> | null = null;

async function ensureTableInternal() {
  const dataset = client.dataset(DATASET);
  const table = dataset.table(TABLE);
  const [exists] = await table.exists();
  if (!exists) {
    await table.create({
      schema: [
        { name: 'prompt_type', type: 'STRING' },
        { name: 'version', type: 'INT64' },
        { name: 'prompt_text', type: 'STRING' },
        { name: 'created_at', type: 'TIMESTAMP' },
      ],
    });
    return;
  }

  await client.query({
    query: `ALTER TABLE \`${PROJECT_ID}.${DATASET}.${TABLE}\` ADD COLUMN IF NOT EXISTS prompt_type STRING`,
  });
}

function ensureTable(): Promise<void> {
  if (!ensureTablePromise) {
    ensureTablePromise = ensureTableInternal().catch((error) => {
      ensureTablePromise = null;
      throw error;
    });
  }
  return ensureTablePromise;
}

function mapPromptRow(row: Record<string, unknown>, promptType: ThreadsPromptType): PromptRow {
  return {
    prompt_type: promptType,
    version: Number(row.version),
    prompt_text: String(row.prompt_text ?? ''),
    created_at: String(row.created_at ?? ''),
  };
}

export async function getLatestPrompt(promptType: ThreadsPromptType): Promise<PromptRow | null> {
  await ensureTable();
  const [rows] = await client.query({
    query: `
      SELECT version, prompt_text, created_at
      FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
      WHERE COALESCE(prompt_type, 'ai-tips') = @promptType
      ORDER BY version DESC
      LIMIT 1
    `,
    params: { promptType },
  });
  if (!rows.length) return null;
  return mapPromptRow(rows[0], promptType);
}

export async function listPromptVersions(promptType: ThreadsPromptType, limit = 10): Promise<PromptRow[]> {
  await ensureTable();
  const [rows] = await client.query({
    query: `
      SELECT version, prompt_text, created_at
      FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
      WHERE COALESCE(prompt_type, 'ai-tips') = @promptType
      ORDER BY version DESC
      LIMIT @limit
    `,
    params: { promptType, limit },
  });
  return rows.map((row) => mapPromptRow(row, promptType));
}

export async function savePrompt(promptType: ThreadsPromptType, promptText: string): Promise<PromptRow> {
  await ensureTable();
  const latest = await getLatestPrompt(promptType);
  const nextVersion = (latest?.version ?? 0) + 1;
  const now = new Date().toISOString();
  const dataset = client.dataset(DATASET);
  await dataset.table(TABLE).insert([
    {
      prompt_type: promptType,
      version: nextVersion,
      prompt_text: promptText,
      created_at: now,
    },
  ]);
  return {
    prompt_type: promptType,
    version: nextVersion,
    prompt_text: promptText,
    created_at: now,
  };
}

export async function restorePrompt(promptType: ThreadsPromptType, version: number): Promise<PromptRow | null> {
  await ensureTable();
  const [rows] = await client.query({
    query: `
      SELECT version, prompt_text, created_at
      FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
      WHERE COALESCE(prompt_type, 'ai-tips') = @promptType
        AND version = @version
      LIMIT 1
    `,
    params: { promptType, version },
  });
  if (!rows.length) return null;
  const restored = mapPromptRow(rows[0], promptType);
  return savePrompt(promptType, restored.prompt_text);
}

export async function getEffectivePrompt(
  promptType: ThreadsPromptType,
  fallbackPrompt: string,
): Promise<string> {
  const latest = await getLatestPrompt(promptType);
  return latest?.prompt_text.trim() || fallbackPrompt;
}
