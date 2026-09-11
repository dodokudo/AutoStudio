import { createHash } from 'node:crypto';
import type { RunResult } from './seminarSlotRunner';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

function retryKeyFor(deliveryKey: string): string {
  const hex = createHash('sha256').update(deliveryKey).digest('hex').slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}

export function seminarNotificationKey(result: RunResult): string {
  return `lstep_seminar_schedule:${result.launchId ?? 'legacy'}:${result.executionId ?? result.ranAt}:${result.issues.length ? 'failed' : 'success'}`;
}

export function seminarNotificationText(result: RunResult): string {
  const success = result.issues.length === 0;
  const title = success ? 'Lステップ セミナー日時更新完了' : 'Lステップ セミナー日時更新失敗';
  const ranAt = new Date(result.ranAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false });
  const details = result.steps
    .filter((step) => step.step !== 'Lステップログイン・日程タグ')
    .map((step) => `${step.status === 'failed' ? '失敗: ' : '・'}${step.step}: ${step.detail}`);
  return [title, `対象: ${result.launchId ?? '未指定'}`, `実行: ${ranAt} JST`, ...details].join('\n').slice(0, 5_000);
}

export async function notifySeminarSchedule(result: RunResult): Promise<void> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const target = process.env.LSTEP_SEMINAR_REPORT_TARGET_ID;
  if (!token || !target) throw new Error('LINE完了通知の認証情報または送信先がありません');

  const key = seminarNotificationKey(result);
  const response = await fetch(LINE_PUSH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Line-Retry-Key': retryKeyFor(key),
    },
    body: JSON.stringify({
      to: target,
      messages: [{ type: 'text', text: seminarNotificationText(result) }],
    }),
  });
  if (response.ok) {
    console.log(`[LINE] 完了通知受付済み requestId=${response.headers.get('x-line-request-id') ?? 'unknown'}`);
    return;
  }
  const responseBody = await response.text();
  // Cloud Run側の再実行などで同一枠の通知が再送された場合、LINEは409を返すが
  // 最初の通知は送信済みなのでエラー扱いにしない。
  if (response.status === 409 && responseBody.includes('retry key is already accepted')) return;
  throw new Error(`LINE完了通知に失敗しました (${response.status} ${responseBody})`);
}
