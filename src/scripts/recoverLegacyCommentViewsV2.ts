/**
 * V2: 旧投稿(2026/2以前)のコメントツリー全体をThreads APIから取得し直す。
 *
 * V1のバグ: getMyReplies が depth=0 (メイン投稿への直接reply=コメント欄1)しか取らなかった。
 *           syncThreadsFromApi.ts は BFS で自分のreplyにつく自分のreplyも辿る。
 *           今回はその BFS ロジックを採用する。
 *
 * 流れ:
 * 1. 旧投稿 1,547件 を対象
 * 2. 既存の comment_id を Set にキャッシュ
 * 3. 各旧投稿に対し BFS で自分のreplyツリーを取得 → views も取得
 * 4. 既存に無い comment_id だけ INSERT (depthは取得時のdepth)
 * 5. 取得しきれた投稿の legacy: prefix コメントを DELETE
 *    (取れなかった投稿の legacy は orphan として残す)
 *
 * Usage:
 *   DRY_RUN=true npx tsx src/scripts/recoverLegacyCommentViewsV2.ts
 *   DRY_RUN=false LIMIT=5 npx tsx src/scripts/recoverLegacyCommentViewsV2.ts
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

import { createBigQueryClient } from '../lib/bigquery';

const PROJECT_ID = 'mark-454114';
const DATASET = 'autostudio_threads';
const GRAPH_BASE = 'https://graph.threads.net/v1.0';
const MY_USERNAME = 'kudooo_ai';

const DRY_RUN = process.env.DRY_RUN !== 'false';
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : null;
const SLEEP_MS = Number(process.env.SLEEP_MS ?? '200');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getToken(): Promise<string> {
  const bq = createBigQueryClient(PROJECT_ID);
  const [rows] = await bq.query({
    query: `SELECT threads_access_token FROM \`mark-454114.analyca.users\` WHERE user_id = '10012809578833342' AND threads_access_token IS NOT NULL AND threads_token_expires_at > CURRENT_TIMESTAMP() LIMIT 1`,
  });
  if (!rows[0]) throw new Error('no token');
  return (rows[0] as { threads_access_token: string }).threads_access_token;
}

type ApiReply = {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  permalink?: string;
  has_replies?: boolean;
};

async function getRepliesPage(token: string, postId: string): Promise<ApiReply[]> {
  const all: ApiReply[] = [];
  let url: string | null = `${GRAPH_BASE}/${postId}/replies?fields=id,text,username,timestamp,permalink,has_replies&limit=100&access_token=${token}`;
  let page = 0;
  while (url && page < 5) {
    const r = await fetch(url);
    if (!r.ok) break;
    const data = (await r.json()) as { data?: ApiReply[]; paging?: { next?: string }; error?: unknown };
    if (data.error) break;
    if (data.data) all.push(...data.data);
    url = data.paging?.next ?? null;
    page++;
    if (url) await sleep(SLEEP_MS);
  }
  return all;
}

async function getReplyViews(token: string, commentId: string): Promise<number> {
  const r = await fetch(`${GRAPH_BASE}/${commentId}/insights?metric=views&access_token=${token}`);
  if (!r.ok) return 0;
  const d = (await r.json()) as { data?: Array<{ values?: Array<{ value: number }> }> };
  return d.data?.[0]?.values?.[0]?.value ?? 0;
}

type CollectedReply = {
  comment_id: string;
  parent_post_id: string;
  text: string;
  timestamp: string;
  permalink: string | null;
  has_replies: boolean;
  depth: number;
  views: number;
};

async function getMyCommentTree(token: string, rootPostId: string): Promise<CollectedReply[]> {
  const out: CollectedReply[] = [];
  const queue: Array<{ id: string; depth: number }> = [{ id: rootPostId, depth: 0 }];
  const processed = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (processed.has(current.id)) continue;
    processed.add(current.id);
    const replies = await getRepliesPage(token, current.id);
    for (const reply of replies) {
      if (reply.username !== MY_USERNAME) continue;
      const views = await getReplyViews(token, reply.id);
      out.push({
        comment_id: reply.id,
        parent_post_id: rootPostId,
        text: reply.text ?? '',
        timestamp: reply.timestamp ? new Date(reply.timestamp).toISOString() : new Date().toISOString(),
        permalink: reply.permalink ?? null,
        has_replies: !!reply.has_replies,
        depth: current.depth,
        views,
      });
      if (reply.has_replies) {
        queue.push({ id: reply.id, depth: current.depth + 1 });
      }
      await sleep(SLEEP_MS);
    }
  }
  return out;
}

async function main() {
  console.log(`[recoverV2] mode=${DRY_RUN ? 'DRY_RUN' : 'PRODUCTION'} limit=${LIMIT ?? 'all'} sleep=${SLEEP_MS}ms`);
  const token = await getToken();
  const bq = createBigQueryClient(PROJECT_ID);

  // 旧投稿のpost_id一覧 (バックアップから = 確実に旧)
  const [oldRows] = await bq.query({
    query: `SELECT post_id, FORMAT_TIMESTAMP("%Y-%m-%dT%H:%M:%E*S%Ez", posted_at) AS posted_at
            FROM \`${PROJECT_ID}.${DATASET}.threads_posts_backup_20260524\`
            WHERE DATE(posted_at, "Asia/Tokyo") < DATE "2026-02-01"
              AND content LIKE "%【メイン投稿】%"`,
  });
  let oldPosts = oldRows as Array<{ post_id: string; posted_at: string }>;
  if (LIMIT) oldPosts = oldPosts.slice(0, LIMIT);
  console.log(`[recoverV2] old posts: ${oldPosts.length}`);

  // 既存の全 comment_id を取得 (フラットに、グループ化なし)
  const [existingRows] = await bq.query({
    query: `SELECT comment_id FROM \`${PROJECT_ID}.${DATASET}.threads_comments\``,
  });
  const existingIds = new Set((existingRows as Array<{ comment_id: string }>).map((r) => r.comment_id));
  console.log(`[recoverV2] existing comment_ids: ${existingIds.size}`);

  const toInsert: CollectedReply[] = [];
  const postsToCleanLegacy: string[] = [];
  let processed = 0;
  let apiCommentsTotal = 0;
  let postsWithReplies = 0;

  if (oldPosts[0]) console.log('[debug] first post_id:', oldPosts[0].post_id, 'typeof:', typeof oldPosts[0].post_id);
  for (const p of oldPosts) {
    processed++;
    const tree = await getMyCommentTree(token, p.post_id);
    if (processed <= 3) console.log(`[debug] post=${p.post_id} tree.length=${tree.length}`);
    apiCommentsTotal += tree.length;
    if (tree.length > 0) {
      postsWithReplies++;
      postsToCleanLegacy.push(p.post_id);
    }
    for (const c of tree) {
      if (!existingIds.has(c.comment_id)) {
        toInsert.push(c);
        existingIds.add(c.comment_id);
      }
    }
    if (processed % 20 === 0) {
      console.log(`[recoverV2] progress: ${processed}/${oldPosts.length} api_total=${apiCommentsTotal} to_insert=${toInsert.length} posts_with_replies=${postsWithReplies}`);
    }
  }

  console.log(`\n[recoverV2] === summary ===`);
  console.log(`posts_processed: ${processed}`);
  console.log(`api_comments_total: ${apiCommentsTotal}`);
  console.log(`new_to_insert: ${toInsert.length}`);
  console.log(`posts_with_any_reply: ${postsWithReplies}`);
  if (toInsert[0]) console.log(`sample to_insert:`, JSON.stringify(toInsert[0], null, 2));

  if (DRY_RUN) {
    console.log('[recoverV2] DRY_RUN: no DB changes');
    return;
  }

  // 1. legacy: prefix を全部 DELETE (postsToCleanLegacy のpostだけ)
  console.log(`\n[recoverV2] Deleting legacy: for ${postsToCleanLegacy.length} posts that had API replies...`);
  // post_id を数値文字列でJOIN問題回避: comment_idに含まれる post_id でフィルタ
  const legacyDeleteSql = `DELETE FROM \`${PROJECT_ID}.${DATASET}.threads_comments\`
    WHERE STARTS_WITH(comment_id, "legacy:")
      AND REGEXP_EXTRACT(comment_id, r"^legacy:([0-9]+):") IN UNNEST(@pids)`;
  const [delJob] = await bq.createQueryJob({ query: legacyDeleteSql, params: { pids: postsToCleanLegacy } });
  await delJob.getQueryResults();
  console.log(`[recoverV2] legacy DELETE done`);

  // 2. 新規 INSERT (バッチ)
  console.log(`[recoverV2] Inserting ${toInsert.length} new comments...`);
  const chunkSize = 500;
  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize).map((c) => ({
      ...c,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    await bq.dataset(DATASET).table('threads_comments').insert(chunk, { ignoreUnknownValues: true });
    console.log(`[recoverV2] inserted batch ${i / chunkSize + 1}: ${chunk.length}`);
  }
  console.log('[recoverV2] DONE');
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e); process.exit(1); });
