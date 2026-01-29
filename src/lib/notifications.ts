import nodemailer from 'nodemailer';

const ALERT_EMAIL_ENABLED = process.env.ALERT_EMAIL_ENABLED === 'true';
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO;
const ALERT_EMAIL_FROM = process.env.ALERT_EMAIL_FROM;
const ALERT_SMTP_HOST = process.env.ALERT_SMTP_HOST;
const ALERT_SMTP_PORT = process.env.ALERT_SMTP_PORT ? Number(process.env.ALERT_SMTP_PORT) : undefined;
const ALERT_SMTP_SECURE = process.env.ALERT_SMTP_SECURE === 'true';
const ALERT_SMTP_USER = process.env.ALERT_SMTP_USER;
const ALERT_SMTP_PASS = process.env.ALERT_SMTP_PASS;

function canSendEmail() {
  if (!ALERT_EMAIL_ENABLED) {
    return false;
  }
  if (!ALERT_EMAIL_TO || !ALERT_EMAIL_FROM) {
    console.warn('[notifications] ALERT_EMAIL_TO/ALERT_EMAIL_FROM が未設定のため通知をスキップします');
    return false;
  }
  if (!ALERT_SMTP_HOST || ALERT_SMTP_PORT === undefined || !ALERT_SMTP_USER || !ALERT_SMTP_PASS) {
    console.warn('[notifications] SMTP設定が未完成のため通知をスキップします');
    return false;
  }
  return true;
}

export async function sendAlertEmail(subject: string, body: string) {
  if (!canSendEmail()) {
    return;
  }

  const transporter = nodemailer.createTransport({
    host: ALERT_SMTP_HOST,
    port: ALERT_SMTP_PORT,
    secure: ALERT_SMTP_SECURE,
    auth: {
      user: ALERT_SMTP_USER,
      pass: ALERT_SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: ALERT_EMAIL_FROM,
    to: ALERT_EMAIL_TO,
    subject,
    text: body,
  });
}

export async function notifyJobFailure(planId: string, errorMessage: string) {
  const subject = `[Threads自動投稿] ジョブ失敗: ${planId}`;
  const body = `Threads投稿ジョブが失敗しました。\nPlan ID: ${planId}\nエラーメッセージ: ${errorMessage}\n発生時刻: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`;
  await sendAlertEmail(subject, body);
}

export async function notifyGenerateFailure(errorMessage: string) {
  const subject = `[Threads自動投稿] 投稿案生成に失敗`;
  const body = `Claudeへの生成リクエストに失敗しました。\nエラーメッセージ: ${errorMessage}\n発生時刻: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`;
  await sendAlertEmail(subject, body);
}

export async function notifyThreadsSyncFailure(mode: string, errorMessage: string) {
  const subject = `[Threadsデータ同期] 同期に失敗しました (${mode})`;
  const body = `Threadsデータの同期に失敗しました。

同期モード: ${mode}
エラーメッセージ: ${errorMessage}
発生時刻: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}

トークンの有効期限が切れている可能性があります。
Meta for Developersでトークンを更新してください。
`;
  await sendAlertEmail(subject, body);
}

export async function notifyThreadsDataStale(lastDataDate: string, expectedDate: string) {
  const subject = `[Threadsデータ同期] データが更新されていません`;
  const body = `Threadsのデータが最新ではありません。

最新データ日付: ${lastDataDate}
期待される日付: ${expectedDate}
確認時刻: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}

トークンの有効期限が切れている可能性があります。
Meta for Developersでトークンを更新してください。
`;
  await sendAlertEmail(subject, body);
}
