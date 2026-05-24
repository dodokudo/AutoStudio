/**
 * 旧投稿（2026/2以前）のpost_idから、Threads APIで実際のreplies+viewsが取れるかテスト
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

import { createBigQueryClient } from '../lib/bigquery';

const PROJECT_ID = 'mark-454114';
const GRAPH_BASE = 'https://graph.threads.net/v1.0';

async function getToken(): Promise<string> {
  const bq = createBigQueryClient(PROJECT_ID);
  const [rows] = await bq.query({
    query: `SELECT threads_access_token FROM \`mark-454114.analyca.users\` WHERE user_id = '10012809578833342' AND threads_access_token IS NOT NULL AND threads_token_expires_at > CURRENT_TIMESTAMP() LIMIT 1`,
  });
  if (!rows[0]) throw new Error('no token');
  return (rows[0] as { threads_access_token: string }).threads_access_token;
}

async function main() {
  const token = await getToken();
  console.log('[test] token resolved');
  const bq = createBigQueryClient(PROJECT_ID);
  const [oldPosts] = await bq.query({
    query: `SELECT post_id, FORMAT_DATE("%Y-%m-%d", DATE(posted_at,"Asia/Tokyo")) AS d
            FROM \`mark-454114.autostudio_threads.threads_posts\`
            WHERE DATE(posted_at,"Asia/Tokyo") < DATE "2026-02-01"
            ORDER BY posted_at ASC LIMIT 3`,
  });
  for (const p of oldPosts as Array<{ post_id: string; d: string }>) {
    console.log(`\n=== post_id=${p.post_id} posted=${p.d} ===`);
    const r = await fetch(
      `${GRAPH_BASE}/${p.post_id}/replies?fields=id,text,username,timestamp,has_replies&access_token=${token}`,
    );
    const data = (await r.json()) as { data?: Array<{ id: string; text?: string; username?: string; timestamp?: string }>; error?: unknown };
    if (data.error) {
      console.log('ERROR:', JSON.stringify(data.error));
      continue;
    }
    const replies = data.data ?? [];
    console.log(`replies: ${replies.length}`);
    for (const reply of replies.slice(0, 3)) {
      const iR = await fetch(`${GRAPH_BASE}/${reply.id}/insights?metric=views&access_token=${token}`);
      const insights = (await iR.json()) as { data?: Array<{ values?: Array<{ value: number }> }>; error?: unknown };
      const views = insights.data?.[0]?.values?.[0]?.value ?? 0;
      console.log(`  [${reply.username}] views=${views} text="${(reply.text ?? '').slice(0, 40)}..."`);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
