export interface LstepConfig {
  loginUrl: string;
  friendsUrl: string;
  gcsBucket: string;
  storageStateObject: string;
  rawPrefix: string;
  processedPrefix: string;
  dataset: string;
  projectId?: string;
  location: string;
  alertEmails: string[];
  emailFrom: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  emailSubjectPrefix: string;
  downloadTimeoutMs: number;
  retryDelaysMs: number[];
  timeZone: string;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`環境変数 ${key} が未設定です`);
  }
  return value;
}

export function loadLstepConfig(): LstepConfig {
  const retryDelaysRaw = process.env.LSTEP_RETRY_DELAYS_MS;
  const retryDelaysMs = retryDelaysRaw
    ? retryDelaysRaw.split(',').map((v) => Number.parseInt(v.trim(), 10)).filter((v) => Number.isFinite(v) && v > 0)
    : [5000, 10000, 30000];

  const alertEmails = (process.env.LSTEP_ALERT_EMAILS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (alertEmails.length === 0) {
    throw new Error('LSTEP_ALERT_EMAILS が未設定、またはメールアドレスが見つかりません');
  }

  return {
    loginUrl: requireEnv('LSTEP_LOGIN_URL'),
    friendsUrl: requireEnv('LSTEP_FRIENDS_URL'),
    gcsBucket: requireEnv('LSTEP_GCS_BUCKET'),
    storageStateObject: requireEnv('LSTEP_STORAGE_STATE_OBJECT'),
    rawPrefix: process.env.LSTEP_RAW_PREFIX ?? 'lstep/raw',
    processedPrefix: process.env.LSTEP_PROCESSED_PREFIX ?? 'lstep/processed',
    dataset: process.env.LSTEP_BQ_DATASET ?? 'autostudio_lstep',
    projectId: process.env.LSTEP_BQ_PROJECT_ID,
    location: process.env.LSTEP_BQ_LOCATION ?? 'asia-northeast1',
    alertEmails,
    emailFrom: requireEnv('LSTEP_EMAIL_FROM'),
    smtpHost: requireEnv('LSTEP_SMTP_HOST'),
    smtpPort: parsePort(requireEnv('LSTEP_SMTP_PORT')),
    smtpSecure: parseBoolean(process.env.LSTEP_SMTP_SECURE ?? 'true'),
    smtpUser: requireEnv('LSTEP_SMTP_USER'),
    smtpPass: requireEnv('LSTEP_SMTP_PASS'),
    emailSubjectPrefix: process.env.LSTEP_EMAIL_SUBJECT_PREFIX ?? '[Lstep自動取得]',
    downloadTimeoutMs: process.env.LSTEP_DOWNLOAD_TIMEOUT_MS ? Number.parseInt(process.env.LSTEP_DOWNLOAD_TIMEOUT_MS, 10) : 120000,
    retryDelaysMs: retryDelaysMs.length > 0 ? retryDelaysMs : [5000, 10000, 30000],
    timeZone: process.env.LSTEP_TIMEZONE ?? 'Asia/Tokyo',
  };
}

function parsePort(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`SMTPポート番号が不正です: ${value}`);
  }
  return parsed;
}

function parseBoolean(value: string): boolean {
  return value.trim().toLowerCase() !== 'false';
}
