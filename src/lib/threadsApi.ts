const GRAPH_BASE = 'https://graph.threads.net/v1.0';

const THREADS_TOKEN = process.env.THREADS_TOKEN;
const THREADS_BUSINESS_ID = process.env.THREADS_BUSINESS_ID;
const THREADS_POSTING_ENABLED = process.env.THREADS_POSTING_ENABLED === 'true';

if (!THREADS_POSTING_ENABLED) {
  console.info('[threadsApi] THREADS_POSTING_ENABLED is false. Using dry-run mode.');
}


async function request(path: string, options: RequestInit & { params?: Record<string, string> } = {}) {
  const url = new URL(`${GRAPH_BASE}/${path}`);
  if (options.params) {
    Object.entries(options.params).forEach(([key, value]) => url.searchParams.append(key, value));
  }
  if (THREADS_TOKEN) {
    url.searchParams.append('access_token', THREADS_TOKEN);
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

async function createContainer(text: string, replyToId?: string) {
  const body: Record<string, unknown> = {
    text,
    media_type: 'TEXT',
  };

  if (replyToId) {
    body.reply_to_id = replyToId;
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
  const res = await request(`${THREADS_BUSINESS_ID}/threads_publish`, {
    method: 'POST',
    params: { creation_id: containerId },
  });
  if (res.id) {
    return res.id as string;
  }
  await waitForContainer(containerId);
  const statusRes = await request(containerId, {
    method: 'GET',
    params: { fields: 'id' },
  });
  return statusRes.id as string;
}

export async function postThread(text: string, replyToId?: string) {
  console.log('[threadsApi] postThread called:', {
    textLength: text.length,
    hasReplyToId: !!replyToId,
    replyToId,
    postingEnabled: THREADS_POSTING_ENABLED,
    environment: process.env.NODE_ENV,
    hasToken: !!THREADS_TOKEN,
    hasBusinessId: !!THREADS_BUSINESS_ID
  });

  if (!THREADS_POSTING_ENABLED) {
    const mockId = `dryrun-${Date.now()}`;
    console.info('[threadsApi] Skipping Threads publish (dry-run). Returning mock id %s', mockId);
    console.info('[threadsApi] Dry-run mode active. Environment:', {
      NODE_ENV: process.env.NODE_ENV,
      THREADS_POSTING_ENABLED: process.env.THREADS_POSTING_ENABLED
    });
    return mockId;
  }

  if (!THREADS_TOKEN || !THREADS_BUSINESS_ID) {
    const credentialError = new Error('Threads API credentials are not configured');
    console.error('[threadsApi] Credential check failed:', {
      hasToken: !!THREADS_TOKEN,
      hasBusinessId: !!THREADS_BUSINESS_ID,
      tokenLength: THREADS_TOKEN ? THREADS_TOKEN.length : 0,
      businessIdLength: THREADS_BUSINESS_ID ? THREADS_BUSINESS_ID.length : 0,
      environment: process.env.NODE_ENV
    });
    throw credentialError;
  }

  console.log('[threadsApi] Creating container...');
  const containerId = await createContainer(text, replyToId);
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
  if (!THREADS_TOKEN || !THREADS_BUSINESS_ID) {
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
