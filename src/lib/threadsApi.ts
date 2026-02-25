import { createBigQueryClient } from './bigquery';

const GRAPH_BASE = 'https://graph.threads.net/v1.0';

const THREADS_BUSINESS_ID = process.env.THREADS_BUSINESS_ID?.trim();
const THREADS_POSTING_ENABLED = process.env.THREADS_POSTING_ENABLED?.trim() === 'true';

if (!THREADS_POSTING_ENABLED) {
  console.info('[threadsApi] THREADS_POSTING_ENABLED is false. Using dry-run mode.');
}

// ANALYCAのBigQueryからトークンを取得（キャッシュ: 5分）
let _cachedToken: string | null = null;
let _cachedTokenExpiry = 0;
const TOKEN_CACHE_MS = 5 * 60 * 1000;

async function getThreadsToken(): Promise<string | null> {
  // 環境変数にあればそれを使う（フォールバック）
  const envToken = process.env.THREADS_TOKEN?.trim();

  const now = Date.now();
  if (_cachedToken && now < _cachedTokenExpiry) {
    return _cachedToken;
  }

  try {
    const bq = createBigQueryClient();
    const userId = THREADS_BUSINESS_ID || '10012809578833342';
    const [rows] = await bq.query({
      query: `SELECT threads_access_token FROM \`mark-454114.analyca.users\` WHERE user_id = @userId AND threads_access_token IS NOT NULL AND threads_token_expires_at > CURRENT_TIMESTAMP() LIMIT 1`,
      params: { userId },
    });
    if (rows.length > 0 && rows[0].threads_access_token) {
      _cachedToken = rows[0].threads_access_token;
      _cachedTokenExpiry = now + TOKEN_CACHE_MS;
      console.log('[threadsApi] Token fetched from ANALYCA BigQuery (cached 5min)');
      return _cachedToken;
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

async function request(path: string, options: RequestInit & { params?: Record<string, string> } = {}) {
  const token = await getThreadsToken();
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

async function createContainer(text: string, replyToId?: string, linkUrl?: string) {
  const body: Record<string, unknown> = {
    text,
    media_type: 'TEXT',
  };

  if (replyToId) {
    body.reply_to_id = replyToId;
  }

  if (linkUrl) {
    body.link_attachment = linkUrl;
  }

  console.log('[threadsApi] createContainer body:', body);

  const response = await request(`${THREADS_BUSINESS_ID}/threads`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

  console.log('[threadsApi] createContainer response:', response);
  return response.id as string;
}

async function waitForContainer(containerId: string) {
  for (let i = 0; i < 10; i += 1) {
    const statusRes = await request(containerId, {
      method: 'GET',
      params: { fields: 'status,error_message' },
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

async function publishContainer(containerId: string) {
  // まずコンテナの準備が完了するまで待つ
  await waitForContainer(containerId);

  // 準備完了後に公開
  const res = await request(`${THREADS_BUSINESS_ID}/threads_publish`, {
    method: 'POST',
    params: { creation_id: containerId },
  });

  if (res.id) {
    console.log('[threadsApi] Publish response ID:', res.id);
    return res.id as string;
  }

  // IDが返ってこない場合は再度取得
  const statusRes = await request(containerId, {
    method: 'GET',
    params: { fields: 'id' },
  });
  console.log('[threadsApi] Status response ID:', statusRes.id);
  return statusRes.id as string;
}

export async function postThread(text: string, replyToId?: string, linkUrl?: string) {
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
    postingEnabled: THREADS_POSTING_ENABLED,
    environment: process.env.NODE_ENV,
    hasBusinessId: !!THREADS_BUSINESS_ID,
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

  const token = await getThreadsToken();
  if (!token || !THREADS_BUSINESS_ID) {
    const credentialError = new Error('Threads API credentials are not configured');
    console.error('[threadsApi] Credential check failed:', {
      hasToken: !!token,
      hasBusinessId: !!THREADS_BUSINESS_ID,
      environment: process.env.NODE_ENV
    });
    throw credentialError;
  }

  console.log('[threadsApi] Creating container...');
  const containerId = await createContainer(text, replyToId, linkUrl);
  console.log('[threadsApi] Container created:', containerId);

  console.log('[threadsApi] Publishing container...');
  const threadId = await publishContainer(containerId);
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

export async function getThreadInsights(threadId: string): Promise<ThreadInsights> {
  const token = await getThreadsToken();
  if (!token || !THREADS_BUSINESS_ID) {
    throw new Error('Threads API credentials are not configured');
  }

  try {
    // Use the business account ID instead of thread ID for insights
    const response = await request(`${THREADS_BUSINESS_ID}/threads_insights`, {
      params: {
        metric: 'views,likes,replies,reposts,quotes',
        media_id: threadId
      }
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
