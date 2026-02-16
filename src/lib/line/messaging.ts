const LINE_PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push';

interface LinePushMessageOptions {
  to: string;
  messages: Array<{ type: 'text'; text: string }>;
}

export async function pushLineMessage(
  channelAccessToken: string,
  options: LinePushMessageOptions,
): Promise<void> {
  if (!channelAccessToken) {
    console.warn('[line/messaging] Channel access token is not set, skipping push');
    return;
  }

  const response = await fetch(LINE_PUSH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      to: options.to,
      messages: options.messages,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LINE push message failed: ${response.status} ${text}`);
  }
}

/** LINE text message is max 5000 chars. Split on newline boundaries. */
export function splitMessage(text: string, maxLength = 5000): string[] {
  if (text.length <= maxLength) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    const breakPoint = remaining.lastIndexOf('\n', maxLength);
    const splitAt = breakPoint > 0 ? breakPoint : maxLength;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n/, '');
  }
  return chunks;
}
