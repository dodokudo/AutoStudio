const LINE_NOTIFY_ENDPOINT = 'https://notify-api.line.me/api/notify';

export async function sendLineNotify(token: string, message: string): Promise<void> {
  if (!token) {
    console.warn('LINE Notify トークンが未設定のため通知をスキップしました');
    return;
  }

  const params = new URLSearchParams();
  params.set('message', message);

  const response = await fetch(LINE_NOTIFY_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LINE Notify の送信に失敗しました: ${response.status} ${text}`);
  }
}
