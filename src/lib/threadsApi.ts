const GRAPH_BASE = 'https://graph.threads.net/v1.0';

const THREADS_TOKEN = process.env.THREADS_TOKEN;
const THREADS_ACCOUNT_ID = process.env.THREADS_ACCOUNT_ID;
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
  const body = {
    text,
    media_type: 'TEXT',
    reply_to_id: replyToId,
  };

  const response = await request(`${THREADS_ACCOUNT_ID}/threads`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

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
  const res = await request(`${THREADS_ACCOUNT_ID}/threads_publish`, {
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
  if (!THREADS_POSTING_ENABLED) {
    const mockId = `dryrun-${Date.now()}`;
    console.info('[threadsApi] Skipping Threads publish (dry-run). Returning mock id %s', mockId);
    return mockId;
  }

  if (!THREADS_TOKEN || !THREADS_ACCOUNT_ID) {
    throw new Error('Threads API credentials are not configured');
  }

  const containerId = await createContainer(text, replyToId);
  const threadId = await publishContainer(containerId);
  return threadId;
}
