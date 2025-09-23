import { BigQuery } from '@google-cloud/bigquery';

const DATASET = 'autostudio_threads';
const PROJECT_ID = process.env.BQ_PROJECT_ID ?? 'mark-454114';
const TABLE = 'threads_prompt_settings';

interface PromptRow {
  version: number;
  prompt_text: string;
  created_at: string;
}

const client = new BigQuery({
  projectId: PROJECT_ID,
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
});

async function ensureTable() {
  const dataset = client.dataset(DATASET);
  const table = dataset.table(TABLE);
  const [exists] = await table.exists();
  if (!exists) {
    await table.create({
      schema: [
        { name: 'version', type: 'INT64' },
        { name: 'prompt_text', type: 'STRING' },
        { name: 'created_at', type: 'TIMESTAMP' },
      ],
    });
  }
}

export async function getLatestPrompt(): Promise<PromptRow | null> {
  await ensureTable();
  const [rows] = await client.query({
    query: `
      SELECT version, prompt_text, created_at
      FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
      ORDER BY version DESC
      LIMIT 1
    `,
  });
  if (!rows.length) return null;
  const row = rows[0];
  return {
    version: Number(row.version),
    prompt_text: String(row.prompt_text ?? ''),
    created_at: String(row.created_at ?? ''),
  };
}

export async function listPromptVersions(limit = 10): Promise<PromptRow[]> {
  await ensureTable();
  const [rows] = await client.query({
    query: `
      SELECT version, prompt_text, created_at
      FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
      ORDER BY version DESC
      LIMIT @limit
    `,
    params: { limit },
  });
  return rows.map((row) => ({
    version: Number(row.version),
    prompt_text: String(row.prompt_text ?? ''),
    created_at: String(row.created_at ?? ''),
  }));
}

export async function savePrompt(promptText: string): Promise<PromptRow> {
  await ensureTable();
  const latest = await getLatestPrompt();
  const nextVersion = (latest?.version ?? 0) + 1;
  const now = new Date().toISOString();
  const dataset = client.dataset(DATASET);
  await dataset.table(TABLE).insert([
    {
      version: nextVersion,
      prompt_text: promptText,
      created_at: now,
    },
  ]);
  return {
    version: nextVersion,
    prompt_text: promptText,
    created_at: now,
  };
}

export async function restorePrompt(version: number): Promise<PromptRow | null> {
  await ensureTable();
  const [rows] = await client.query({
    query: `
      SELECT version, prompt_text, created_at
      FROM \`${PROJECT_ID}.${DATASET}.${TABLE}\`
      WHERE version = @version
      LIMIT 1
    `,
    params: { version },
  });
  if (!rows.length) return null;
  const row = rows[0];
  const restored = {
    version: Number(row.version),
    prompt_text: String(row.prompt_text ?? ''),
    created_at: String(row.created_at ?? ''),
  };
  // 保存すると新しいバージョンとして追加
  await savePrompt(restored.prompt_text);
  return restored;
}
