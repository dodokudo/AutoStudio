/**
 * 1件だけ legacy comment を実IDで上書きしてみて、INSERT エラーの詳細を見るデバッグ
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });
import { createBigQueryClient } from '../lib/bigquery';

const PROJECT_ID = 'mark-454114';
const DATASET = 'autostudio_threads';

async function main() {
  const bq = createBigQueryClient(PROJECT_ID);
  const testRow = {
    comment_id: 'test:debug:' + Date.now(),
    parent_post_id: '17915784057191399',
    text: 'debug test',
    timestamp: new Date('2025-10-26T20:50:59+0000').toISOString(), // 正規化済み
    permalink: null,
    has_replies: false,
    depth: 0,
    views: 100,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  try {
    await bq.dataset(DATASET).table('threads_comments').insert([testRow], { ignoreUnknownValues: true });
    console.log('INSERT success');
    // 後始末
    await bq.query({ query: `DELETE FROM \`${PROJECT_ID}.${DATASET}.threads_comments\` WHERE comment_id = @id`, params: { id: testRow.comment_id } });
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string; errors?: unknown; response?: { insertErrors?: unknown[] } };
    console.log('NAME:', err.name);
    console.log('MESSAGE:', err.message);
    console.log('ERRORS sample:', JSON.stringify(err.errors, null, 2)?.slice(0, 2000));
    console.log('response.insertErrors[0]:', JSON.stringify(err.response?.insertErrors?.[0], null, 2));
  }
}
main();
