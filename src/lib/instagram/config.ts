import { resolveProjectId } from '@/lib/bigquery';

type RequiredEnvKey =
  | 'IG_COMPETITOR_DRIVE_FOLDER_ID'
  | 'GEMINI_API_KEY'
  | 'CLAUDE_API_KEY'
  | 'IG_EMAIL_TO'
  | 'IG_EMAIL_FROM'
  | 'IG_SMTP_HOST'
  | 'IG_SMTP_PORT'
  | 'IG_SMTP_USER'
  | 'IG_SMTP_PASS';

function requireEnv(key: RequiredEnvKey): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`環境変数 ${key} が未設定です`);
  }
  return value;
}

export interface InstagramConfig {
  driveFolderIds: string[];
  geminiApiKey: string;
  claudeApiKey: string;
  claudeModel: string;
  emailTo: string[];
  emailFrom: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  projectId: string;
  dataset: string;
  location: string;
  threadsAccountId?: string;
  threadsToken?: string;
  defaultUserId: string;
}

function parseList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function loadInstagramConfig(): InstagramConfig {
  const projectId = resolveProjectId(process.env.IG_BQ_PROJECT_ID ?? process.env.BQ_PROJECT_ID);
  const dataset = process.env.IG_BQ_DATASET ?? 'autostudio_instagram';
  const location = process.env.IG_GCP_LOCATION ?? process.env.LSTEP_BQ_LOCATION ?? 'asia-northeast1';
  const defaultUserId = process.env.IG_DEFAULT_USER_ID ?? 'kudooo_ai';

  console.log('[instagram/config] IG_DEFAULT_USER_ID env var:', process.env.IG_DEFAULT_USER_ID);
  console.log('[instagram/config] Using defaultUserId:', defaultUserId);

  return {
    driveFolderIds: parseList(requireEnv('IG_COMPETITOR_DRIVE_FOLDER_ID')),
    geminiApiKey: requireEnv('GEMINI_API_KEY'),
    claudeApiKey: requireEnv('CLAUDE_API_KEY'),
    claudeModel: process.env.CLAUDE_MODEL_INSTAGRAM ?? process.env.CLAUDE_MODEL ?? 'claude-3-5-sonnet-20241022',
    emailTo: parseList(requireEnv('IG_EMAIL_TO')),
    emailFrom: requireEnv('IG_EMAIL_FROM'),
    smtpHost: requireEnv('IG_SMTP_HOST'),
    smtpPort: Number.parseInt(requireEnv('IG_SMTP_PORT'), 10),
    smtpUser: requireEnv('IG_SMTP_USER'),
    smtpPass: requireEnv('IG_SMTP_PASS'),
    projectId,
    dataset,
    location,
    threadsAccountId: process.env.IG_THREADS_ACCOUNT_ID,
    threadsToken: process.env.IG_THREADS_TOKEN,
    defaultUserId,
  };
}
