/**
 * legacy: prefix の threads_comments を、Threads APIから取得した実データで上書きする。
 *
 * - legacy comment は parent_post_id ごとに timestamp昇順で c1, c2, c3... と並んでいる
 * - Threads API の /{post_id}/replies で kudooo_ai 自身のreply一覧を取得
 * - reply の timestamp昇順 = c1, c2, c3... と対応
 * - 各replyの views を /{reply_id}/insights?metric=views で取得
 * - legacy commentを DELETE → 実IDで INSERT し直す（comment_idが変わるためUPDATEではなくreplace）
 *
 * Usage:
 *   DRY_RUN=true npx tsx src/scripts/recoverLegacyCommentViews.ts
 *   DRY_RUN=false npx tsx src/scripts/recoverLegacyCommentViews.ts
 *   LIMIT=5 で先頭5投稿だけ処理（テスト用）
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
const SLEEP_MS = Number(process.env.SLEEP_MS ?? '300');

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

/**
 * メイン投稿への直接reply(コメント欄1)、その自分のreplyへの返信(コメント欄2)...
 * とBFSで辿って自分のコメントツリー全体を取得する。
 * syncThreadsFromApi.ts の getMyCommentTree と同じロジック。
 */
async function getMyCommentTree(token: string, rootPostId: string): Promise<ApiReply[]> {
  const myReplies: ApiReply[] = [];
  const queue: Array<{ id: string; depth: number }> = [{ id: rootPostId, depth: 0 }];
  const processed = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (processed.has(current.id)) continue;
    processed.add(current.id);
    const replies = await getRepliesPage(token, current.id);
    for (const reply of replies) {
      if (reply.username === MY_USERNAME) {
        myReplies.push({ ...reply });
        if (reply.has_replies) {
          queue.push({ id: reply.id, depth: current.depth + 1 });
        }
      }
    }
    await sleep(SLEEP_MS);
  }
  return myReplies;
}

async function getReplyViews(token: string, commentId: string): Promise<number> {
  const r = await fetch(`${GRAPH_BASE}/${commentId}/insights?metric=views&access_token=${token}`);
  if (!r.ok) return 0;
  const d = (await r.json()) as { data?: Array<{ values?: Array<{ value: number }> }> };
  return d.data?.[0]?.values?.[0]?.value ?? 0;
}

async function main() {
  console.log(`[recover] mode=${DRY_RUN ? 'DRY_RUN' : 'PRODUCTION'} limit=${LIMIT ?? 'all'} sleep=${SLEEP_MS}ms`);
  const token = await getToken();
  const bq = createBigQueryClient(PROJECT_ID);

  // 対象: legacy: prefix を持つ comment が紐づく post_id
  // 注意: BigQuery は GROUP BY parent_post_id (STRING 17桁) で内部数値化して指数表記になるバグがある
  // そのため、フラットに取得して JS 側でグルーピングする
  const targetSql = `
    SELECT
      parent_post_id,
      comment_id,
      text,
      FORMAT_TIMESTAMP("%Y-%m-%dT%H:%M:%E*S%Ez", timestamp) AS timestamp
    FROM \`${PROJECT_ID}.${DATASET}.threads_comments\`
    WHERE STARTS_WITH(comment_id, "legacy:")
    ORDER BY comment_id
  `;
  const [flatRows] = await bq.query({ query: targetSql });
  // JS側でグルーピング。comment_id (legacy:<post_id>:cN) から post_id を抽出する方が確実
  const grouped = new Map<string, Array<{ comment_id: string; text: string; timestamp: string }>>();
  for (const r of flatRows as Array<{ comment_id: string; text: string; timestamp: string }>) {
    const m = r.comment_id.match(/^legacy:(\d+):c\d+$/);
    if (!m) continue;
    const pid = m[1];
    if (!grouped.has(pid)) grouped.set(pid, []);
    grouped.get(pid)!.push({ comment_id: r.comment_id, text: r.text, timestamp: r.timestamp });
  }
  // legacy_rows を timestamp昇順、ただし legacy:xxx:c1 → c2 → c3 の方が確実なので comment_id末尾番号でソート
  for (const arr of grouped.values()) {
    arr.sort((a, b) => {
      const na = Number(a.comment_id.match(/c(\d+)$/)?.[1] ?? 0);
      const nb = Number(b.comment_id.match(/c(\d+)$/)?.[1] ?? 0);
      return na - nb;
    });
  }
  const targets = Array.from(grouped.entries()).map(([pid, rows]) => ({
    parent_post_id: pid,
    legacy_count: rows.length,
    legacy_rows: rows,
  }));
  if (LIMIT) targets.splice(LIMIT);
  console.log(`[recover] target posts: ${targets.length}`);
  if (targets[0]) {
    console.log('[debug] first parent_post_id:', targets[0].parent_post_id, 'len:', targets[0].parent_post_id.length);
  }

  type LegacyRow = { comment_id: string; text: string; timestamp: string };
  type Target = { parent_post_id: string; legacy_count: number; legacy_rows: LegacyRow[] };

  let processedPosts = 0;
  let matchedComments = 0;
  let unmatchedComments = 0;
  let apiNoReplies = 0;
  const updates: Array<{
    old_id: string;
    new_id: string;
    parent_post_id: string;
    text: string;
    timestamp: string;
    permalink: string | null;
    has_replies: boolean;
    views: number;
  }> = [];
  const orphanLegacyIds: string[] = [];

  for (const raw of targets as Target[]) {
    processedPosts++;
    // BFS でメイン投稿→自分のreply→そのreplyへの自分の返信... 全階層取得
    const replies = await getMyCommentTree(token, raw.parent_post_id);
    if (replies.length === 0) {
      apiNoReplies++;
      console.log(`[recover] (${processedPosts}/${targets.length}) post=${raw.parent_post_id} no api replies (legacy=${raw.legacy_count})`);
      // legacy はそのまま残す（views=0 のまま）
      continue;
    }
    // legacy timestamp昇順 と api timestamp昇順 を対応付け
    const pairCount = Math.min(replies.length, raw.legacy_rows.length);
    for (let i = 0; i < pairCount; i++) {
      const reply = replies[i];
      const legacy = raw.legacy_rows[i];
      const views = await getReplyViews(token, reply.id);
      await sleep(SLEEP_MS);
      const rawTs = reply.timestamp ?? legacy.timestamp;
      // BigQuery streaming insert は "+0000" 形式を拒否する。ISO 8601 extended に正規化
      const normalizedTs = rawTs ? new Date(rawTs).toISOString() : new Date().toISOString();
      updates.push({
        old_id: legacy.comment_id,
        new_id: reply.id,
        parent_post_id: raw.parent_post_id,
        text: reply.text ?? legacy.text,
        timestamp: normalizedTs,
        permalink: reply.permalink ?? null,
        has_replies: !!reply.has_replies,
        views,
      });
      matchedComments++;
    }
    // legacy のうち、APIに対応するreplyが無い余分は孤立（views取得できず）
    if (raw.legacy_rows.length > replies.length) {
      for (let i = replies.length; i < raw.legacy_rows.length; i++) {
        orphanLegacyIds.push(raw.legacy_rows[i].comment_id);
        unmatchedComments++;
      }
    }
    if (processedPosts % 20 === 0) {
      console.log(`[recover] progress: ${processedPosts}/${targets.length} matched=${matchedComments} orphan=${unmatchedComments} no_reply=${apiNoReplies}`);
    }
    await sleep(SLEEP_MS);
  }

  console.log(`\n[recover] === summary ===`);
  console.log(`posts_processed: ${processedPosts}`);
  console.log(`comments_matched: ${matchedComments}`);
  console.log(`comments_orphan (legacy without api reply): ${unmatchedComments}`);
  console.log(`posts_with_no_api_replies: ${apiNoReplies}`);
  if (updates.length > 0) {
    console.log(`\nsample update:`);
    console.log(JSON.stringify(updates[0], null, 2));
  }

  if (DRY_RUN) {
    console.log('\n[recover] DRY_RUN: no DB changes');
    return;
  }

  console.log('\n[recover] Applying updates to BigQuery...');
  // バッチでまとめて DELETE + INSERT する
  // 1. 既存legacy comment_id をDELETE (matched分だけ)
  const oldIds = updates.map((u) => u.old_id);
  const orphans = orphanLegacyIds;
  // BigQuery DML: DELETE WHERE comment_id IN UNNEST(@ids)
  const deleteSql = `DELETE FROM \`${PROJECT_ID}.${DATASET}.threads_comments\` WHERE comment_id IN UNNEST(@ids)`;
  const [delJob] = await bq.createQueryJob({ query: deleteSql, params: { ids: oldIds } });
  await delJob.getQueryResults();
  console.log(`[recover] deleted ${oldIds.length} legacy comments (replaced).`);

  // 2. 実IDで INSERT (バッチ)
  // バッチ: 一度に1000行までで分割
  const insertChunkSize = 500;
  for (let i = 0; i < updates.length; i += insertChunkSize) {
    const chunk = updates.slice(i, i + insertChunkSize);
    const rows = chunk.map((u) => ({
      comment_id: u.new_id,
      parent_post_id: u.parent_post_id,
      text: u.text,
      timestamp: u.timestamp,
      permalink: u.permalink,
      has_replies: u.has_replies,
      depth: 0,
      views: u.views,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    await bq.dataset(DATASET).table('threads_comments').insert(rows, { ignoreUnknownValues: true });
    console.log(`[recover] inserted batch ${i / insertChunkSize + 1}: ${rows.length} rows`);
  }
  console.log(`[recover] orphan legacy kept as-is (views=0): ${orphans.length}`);
  console.log('[recover] DONE');
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e); process.exit(1); });
