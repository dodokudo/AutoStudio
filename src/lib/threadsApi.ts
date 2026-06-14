import { createBigQueryClient } from './bigquery';
import {
  getThreadsAccount,
  resolveThreadsAccountKey,
  type ThreadsAccountKey,
} from './threadsAccounts';
import type { ThreadsMediaItem } from './threadsMedia';

const GRAPH_BASE = 'https://graph.threads.net/v1.0';

const THREADS_BUSINESS_ID = process.env.THREADS_BUSINESS_ID?.trim();
const THREADS_POSTING_ENABLED = process.env.THREADS_POSTING_ENABLED?.trim() === 'true';

if (!THREADS_POSTING_ENABLED) {
  console.info('[threadsApi] THREADS_POSTING_ENABLED is false. Using dry-run mode.');
}

type TokenCacheEntry = {
  token: string;
  expiresAt: number;
};

// ANALYCAのBigQueryからトークンを取得（キャッシュ: 5分）
const _cachedTokens = new Map<string, TokenCacheEntry>();
const TOKEN_CACHE_MS = 5 * 60 * 1000;

function resolveThreadsUserId(accountKey?: ThreadsAccountKey): string {
  if (!accountKey && THREADS_BUSINESS_ID) {
    return THREADS_BUSINESS_ID;
  }
  return getThreadsAccount(resolveThreadsAccountKey(accountKey)).threadsUserId;
}

async function getThreadsToken(accountKey?: ThreadsAccountKey): Promise<string | null> {
  // 環境変数にあればそれを使う（フォールバック）
  const envToken = process.env.THREADS_TOKEN?.trim();
  const userId = resolveThreadsUserId(accountKey);

  const now = Date.now();
  const cached = _cachedTokens.get(userId);
  if (cached && now < cached.expiresAt) {
    return cached.token;
  }

  try {
    const bq = createBigQueryClient();
    const [rows] = await bq.query({
      query: `SELECT threads_access_token FROM \`mark-454114.analyca.users\` WHERE user_id = @userId AND threads_access_token IS NOT NULL AND threads_token_expires_at > CURRENT_TIMESTAMP() LIMIT 1`,
      params: { userId },
    });
    if (rows.length > 0 && rows[0].threads_access_token) {
      const token = String(rows[0].threads_access_token);
      _cachedTokens.set(userId, { token, expiresAt: now + TOKEN_CACHE_MS });
      console.log('[threadsApi] Token fetched from ANALYCA BigQuery (cached 5min)', { userId });
      return token;
    }
  } catch (err) {
    console.warn('[threadsApi] Failed to fetch token from ANALYCA BigQuery:', err instanceof Error ? err.message : err);
  }

  // BigQueryから取れなければ環境変数にフォールバック
  if (envToken) {
    console.warn('[threadsApi] Using fallback env THREADS_TOKEN');
    return envToken;
  }
  return null;
}

async function request(
  path: string,
  options: RequestInit & { params?: Record<string, string>; accountKey?: ThreadsAccountKey } = {},
) {
  const token = await getThreadsToken(options.accountKey);
  const url = new URL(`${GRAPH_BASE}/${path}`);
  if (options.params) {
    Object.entries(options.params).forEach(([key, value]) => url.searchParams.append(key, value));
  }
  if (token) {
    url.searchParams.append('access_token', token);
  }
  const res = await fetch(url.toString(), {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Threads API error: ${res.status} ${res.statusText} ${text}`);
  }
  return res.json();
}

async function createContainer(body: Record<string, unknown>, accountKey?: ThreadsAccountKey) {
  const userId = resolveThreadsUserId(accountKey);
  console.log('[threadsApi] createContainer body:', body);

  const response = await request(`${userId}/threads`, {
    method: 'POST',
    body: JSON.stringify(body),
    accountKey,
  });

  console.log('[threadsApi] createContainer response:', response);
  return response.id as string;
}

async function waitForContainer(containerId: string, accountKey?: ThreadsAccountKey) {
  for (let i = 0; i < 30; i += 1) {
    const statusRes = await request(containerId, {
      method: 'GET',
      params: { fields: 'status,error_message' },
      accountKey,
    });
    if (statusRes.status === 'ERROR') {
      throw new Error(statusRes.error_message ?? 'Container creation failed');
    }
    if (statusRes.status === 'FINISHED') {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Timed out waiting for container');
}

async function publishContainer(containerId: string, accountKey?: ThreadsAccountKey) {
  const userId = resolveThreadsUserId(accountKey);
  // まずコンテナの準備が完了するまで待つ
  await waitForContainer(containerId, accountKey);

  // 準備完了後に公開
  const res = await request(`${userId}/threads_publish`, {
    method: 'POST',
    params: { creation_id: containerId },
    accountKey,
  });

  if (res.id) {
    console.log('[threadsApi] Publish response ID:', res.id);
    return res.id as string;
  }

  // IDが返ってこない場合は再度取得
  const statusRes = await request(containerId, {
    method: 'GET',
    params: { fields: 'id' },
    accountKey,
  });
  console.log('[threadsApi] Status response ID:', statusRes.id);
  return statusRes.id as string;
}

export async function postThread(
  input: string | { text: string; mediaItems?: ThreadsMediaItem[]; replyToId?: string },
  legacyReplyToId?: string,
  linkUrl?: string,
  accountKey?: ThreadsAccountKey,
) {
  let text = typeof input === 'string' ? input : input.text;
  const replyToId = typeof input === 'string' ? legacyReplyToId : input.replyToId;
  const mediaItems = typeof input === 'string' ? [] : (input.mediaItems || []).slice(0, 10);
  // Threads API の500文字制限バリデーション
  const THREADS_TEXT_LIMIT = 500;
  if (text.length > THREADS_TEXT_LIMIT) {
    const original = text.length;
    text = text.slice(0, THREADS_TEXT_LIMIT);
    console.warn(`[threadsApi] Text truncated from ${original} to 500 chars`);
  }

  const rawEnv = process.env.THREADS_POSTING_ENABLED;
  const trimmedEnv = rawEnv?.trim();
  const isEnabled = trimmedEnv === 'true';

  console.log('[threadsApi] postThread called:', {
    textLength: text.length,
    hasReplyToId: !!replyToId,
    replyToId,
    hasLinkUrl: !!linkUrl,
    linkUrl,
    mediaCount: mediaItems.length,
    postingEnabled: THREADS_POSTING_ENABLED,
    environment: process.env.NODE_ENV,
    hasBusinessId: !!THREADS_BUSINESS_ID,
    accountKey: resolveThreadsAccountKey(accountKey),
    threadsUserId: resolveThreadsUserId(accountKey),
    rawEnvValue: rawEnv,
    rawEnvLength: rawEnv?.length,
    trimmedEnvValue: trimmedEnv,
    trimmedEnvLength: trimmedEnv?.length,
    isEnabled
  });

  if (!THREADS_POSTING_ENABLED) {
    const mockId = `dryrun-${Date.now()}`;
    console.info('[threadsApi] Skipping Threads publish (dry-run). Returning mock id %s', mockId);
    console.info('[threadsApi] Dry-run mode active. Environment:', {
      NODE_ENV: process.env.NODE_ENV,
      THREADS_POSTING_ENABLED: process.env.THREADS_POSTING_ENABLED,
      rawValue: rawEnv,
      comparison: `'${trimmedEnv}' === 'true' = ${isEnabled}`
    });
    return mockId;
  }

  const token = await getThreadsToken(accountKey);
  const userId = resolveThreadsUserId(accountKey);
  if (!token || !userId) {
    const credentialError = new Error('Threads API credentials are not configured');
    console.error('[threadsApi] Credential check failed:', {
      hasToken: !!token,
      hasBusinessId: !!userId,
      accountKey: resolveThreadsAccountKey(accountKey),
      environment: process.env.NODE_ENV
    });
    throw credentialError;
  }

  console.log('[threadsApi] Creating container...');
  let containerId: string;
  if (mediaItems.length === 0) {
    containerId = await createContainer({
      text,
      media_type: 'TEXT',
      ...(replyToId ? { reply_to_id: replyToId } : {}),
      ...(linkUrl ? { link_attachment: linkUrl } : {}),
    }, accountKey);
  } else if (mediaItems.length === 1) {
    const item = mediaItems[0];
    containerId = await createContainer({
      text,
      media_type: item.type,
      ...(item.type === 'VIDEO' ? { video_url: item.url } : { image_url: item.url }),
      ...(item.altText ? { alt_text: item.altText } : {}),
      ...(replyToId ? { reply_to_id: replyToId } : {}),
    }, accountKey);
  } else {
    const childIds: string[] = [];
    for (const item of mediaItems) {
      const childId = await createContainer({
        media_type: item.type,
        ...(item.type === 'VIDEO' ? { video_url: item.url } : { image_url: item.url }),
        is_carousel_item: true,
        ...(item.altText ? { alt_text: item.altText } : {}),
      }, accountKey);
      await waitForContainer(childId, accountKey);
      childIds.push(childId);
    }
    containerId = await createContainer({
      text,
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      ...(replyToId ? { reply_to_id: replyToId } : {}),
    }, accountKey);
  }
  console.log('[threadsApi] Container created:', containerId);

  console.log('[threadsApi] Publishing container...');
  const threadId = await publishContainer(containerId, accountKey);
  console.log('[threadsApi] Thread published successfully:', threadId);

  return threadId;
}

export interface ThreadInsights {
  impressions?: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  quotes?: number;
}

export async function getThreadInsights(threadId: string, accountKey?: ThreadsAccountKey): Promise<ThreadInsights> {
  const token = await getThreadsToken(accountKey);
  const userId = resolveThreadsUserId(accountKey);
  if (!token || !userId) {
    throw new Error('Threads API credentials are not configured');
  }

  try {
    // Use the business account ID instead of thread ID for insights
    const response = await request(`${userId}/threads_insights`, {
      params: {
        metric: 'views,likes,replies,reposts,quotes',
        media_id: threadId
      },
      accountKey,
    });

    // Threads APIのレスポンス形式に合わせて解析
    const insights: ThreadInsights = {};
    if (response.data && Array.isArray(response.data)) {
      for (const metric of response.data) {
        switch (metric.name) {
          case 'views':
            insights.impressions = metric.values?.[0]?.value || 0;
            break;
          case 'likes':
            insights.likes = metric.values?.[0]?.value || 0;
            break;
          case 'replies':
            insights.replies = metric.values?.[0]?.value || 0;
            break;
          case 'reposts':
            insights.reposts = metric.values?.[0]?.value || 0;
            break;
          case 'quotes':
            insights.quotes = metric.values?.[0]?.value || 0;
            break;
        }
      }
    }

    return insights;
  } catch (error) {
    console.warn(`[threadsApi] Failed to get insights for thread ${threadId}:`, error);
    // インサイト取得に失敗してもエラーにしない（投稿が新しすぎる等の理由）
    return {};
  }
}
