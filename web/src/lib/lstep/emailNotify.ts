import nodemailer from 'nodemailer';
import type { LstepConfig } from './config';

interface EmailPayload {
  subject: string;
  body: string;
}

export async function sendAlertEmail(config: LstepConfig, payload: EmailPayload): Promise<void> {
  if (!config.alertEmails.length) {
    console.warn('アラート送信先メールアドレスが設定されていないため通知をスキップしました');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });

  await transporter.sendMail({
    from: config.emailFrom,
    to: config.alertEmails,
    subject: payload.subject,
    text: payload.body,
  });
}
