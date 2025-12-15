/**
 * Threads APIから直接データを取得してBigQueryに保存するスクリプト
 * ANALYCAのオンボーディングAPIと同じ取得方法を使用
 *
 * 実行モード:
 * - account: アカウントインサイト取得（1日1回：0時〜1時）
 * - posts: 投稿データ＆インサイト取得（1時間に1回）
 * - comments: コメント欄データ取得（1時間に1回）
 * - all: 全て実行
 *
 * Usage:
 *   npx tsx src/scripts/syncThreadsFromApi.ts [mode]
 *   npm run sync:threads:api -- [mode]
 */

import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { createBigQueryClient, getDataset } from '../lib/bigquery';
import { BigQuery, TableField } from '@google-cloud/bigquery';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

// ============================================================================
// 設定
// ============================================================================

const PROJECT_ID = 'mark-454114';
const DATASET_ID = 'autostudio_threads';
const GRAPH_BASE = 'https://graph.threads.net/v1.0';

const THREADS_TOKEN = process.env.THREADS_TOKEN?.trim();
const THREADS_BUSINESS_ID = process.env.THREADS_BUSINESS_ID?.trim();

// ============================================================================
// 型定義
// ============================================================================

interface ThreadsAccountInfo {
  id: string;
  username: string;
  threads_profile_picture_url?: string;
  threads_biography?: string;
}

interface ThreadsUserInsights {
  followers_count?: number;
  views?: number;  // プロフィールビュー
  replies?: number;
  reposts?: number;
}

interface ThreadsPost {
  id: string;
  text?: string;
  timestamp: string;
  permalink: string;
  media_type: string;
  is_quote_post?: boolean;
}

interface ThreadsInsights {
  views?: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  quotes?: number;
}

interface ThreadsReply {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  permalink: string;
  has_replies: boolean;
  reply_to_root_post_id?: string;
}

interface ThreadsComment {
  comment_id: string;
  parent_post_id: string;
  text: string;
  timestamp: string;
  permalink: string;
  has_replies: boolean;
  depth: number;
  views: number;
}

// ============================================================================
// API呼び出し（ANALYCAと同じ方式）
// ============================================================================

async function getThreadsAccountInfo(accessToken: string): Promise<ThreadsAccountInfo> {
  const response = await fetch(
    `${GRAPH_BASE}/me?fields=id,username,threads_profile_picture_url,threads_biography&access_token=${accessToken}`
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Threadsアカウント情報の取得に失敗しました: ${error}`);
  }

  return await response.json();
}

async function getThreadsUserInsights(accessToken: string, threadsUserId: string): Promise<ThreadsUserInsights & { dateStr: string }> {
  try {
    // GASと同じ方式: period=day + since/until で昨日のデータを取得
    // JST（日本時間）で昨日を計算
    const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000); // UTC+9
    const yesterdayJst = new Date(nowJst);
    yesterdayJst.setDate(yesterdayJst.getDate() - 1);

    // JSTの昨日の0:00と23:59:59をUNIXタイムスタンプに変換
    const dateStr = yesterdayJst.toISOString().split('T')[0]; // YYYY-MM-DD
    const sinceTs = Math.floor(new Date(`${dateStr}T00:00:00+09:00`).getTime() / 1000);
    const untilTs = Math.floor(new Date(`${dateStr}T23:59:59+09:00`).getTime() / 1000);

    const metrics = 'views,followers_count,replies,reposts';
    const response = await fetch(
      `${GRAPH_BASE}/${threadsUserId}/threads_insights?metric=${metrics}&period=day&since=${sinceTs}&until=${untilTs}&access_token=${accessToken}`
    );

    if (!response.ok) {
      console.warn('[syncThreadsFromApi] Failed to get Threads user insights:', await response.text());
      return {};
    }

    const data = await response.json();
    const insights: ThreadsUserInsights = {};

    if (data.data && Array.isArray(data.data)) {
      for (const metric of data.data) {
        let value = 0;
        if (metric.total_value) {
          value = metric.total_value.value || 0;
        } else if (metric.values && metric.values.length > 0) {
          value = metric.values[metric.values.length - 1].value || 0;
        }

        switch (metric.name) {
          case 'followers_count':
            insights.followers_count = value;
            break;
          case 'views':
            insights.views = value;
            break;
          case 'replies':
            insights.replies = value;
            break;
          case 'reposts':
            insights.reposts = value;
            break;
        }
      }
    }

    console.log(`[syncThreadsFromApi] User insights for ${dateStr}: followers=${insights.followers_count}, views=${insights.views}`);
    return { ...insights, dateStr };
  } catch (error) {
    console.error('[syncThreadsFromApi] Error getting user insights:', error);
    return { dateStr: '' };
  }
}

async function getThreadsPosts(accessToken: string, limit = 100): Promise<ThreadsPost[]> {
  const response = await fetch(
    `${GRAPH_BASE}/me/threads?fields=id,text,timestamp,permalink,media_type,is_quote_post&limit=${limit}&access_token=${accessToken}`
  );

  if (!response.ok) {
    console.warn('[syncThreadsFromApi] Failed to get Threads posts');
    return [];
  }

  const data = await response.json();
  return data.data || [];
}

async function getPostInsights(accessToken: string, postId: string): Promise<ThreadsInsights> {
  try {
    const response = await fetch(
      `${GRAPH_BASE}/${postId}/insights?metric=views,likes,replies,reposts,quotes&access_token=${accessToken}`
    );

    if (!response.ok) {
      return {};
    }

    const data = await response.json();
    const insights: ThreadsInsights = {};

    if (data.data && Array.isArray(data.data)) {
      for (const metric of data.data) {
        switch (metric.name) {
          case 'views':
            insights.views = metric.values?.[0]?.value || 0;
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
  } catch {
    return {};
  }
}

async function getReplies(accessToken: string, postId: string): Promise<ThreadsReply[]> {
  try {
    const response = await fetch(
      `${GRAPH_BASE}/${postId}/replies?fields=id,text,username,timestamp,permalink,has_replies,reply_to_root_post_id&access_token=${accessToken}`
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.data || [];
  } catch {
    return [];
  }
}

async function getCommentViews(accessToken: string, commentId: string): Promise<number> {
  try {
    const response = await fetch(
      `${GRAPH_BASE}/${commentId}/insights?metric=views&access_token=${accessToken}`
    );

    if (!response.ok) {
      return 0;
    }

    const data = await response.json();
    if (data.data && data.data[0]) {
      return data.data[0].values?.[0]?.value || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

async function getMyCommentTree(
  accessToken: string,
  rootPostId: string,
  myUsername: string
): Promise<Array<ThreadsComment>> {
  const myComments: Array<ThreadsComment> = [];
  const queue: Array<{ id: string; depth: number }> = [{ id: rootPostId, depth: 0 }];
  const processedIds = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (processedIds.has(current.id)) continue;
    processedIds.add(current.id);

    try {
      const replies = await getReplies(accessToken, current.id);

      for (const reply of replies) {
        if (reply.username === myUsername) {
          const views = await getCommentViews(accessToken, reply.id);

          myComments.push({
            comment_id: reply.id,
            parent_post_id: rootPostId,
            text: reply.text || '',
            timestamp: reply.timestamp,
            permalink: reply.permalink,
            has_replies: reply.has_replies,
            depth: current.depth,
            views,
          });

          if (reply.has_replies) {
            queue.push({ id: reply.id, depth: current.depth + 1 });
          }
        }
      }

      await sleep(300);
    } catch (error) {
      console.warn(`[syncThreadsFromApi] Error fetching replies for ${current.id}:`, error);
    }
  }

  return myComments;
}

// ============================================================================
// 同期処理
// ============================================================================

async function syncAccountInsights(bigQueryClient: BigQuery, accessToken: string, threadsUserId: string): Promise<void> {
  console.log('[syncThreadsFromApi] === Syncing Account Insights ===');

  const insights = await getThreadsUserInsights(accessToken, threadsUserId);
  const followersCount = insights.followers_count || 0;
  const profileViews = insights.views || 0;  // プロフィールビュー（GASと同じ）
  const dateStr = insights.dateStr; // API取得時に計算したJSTの昨日

  if (!dateStr) {
    console.error('[syncThreadsFromApi] Failed to get date string');
    return;
  }

  console.log(`[syncThreadsFromApi] Date: ${dateStr}, Followers: ${followersCount}, Profile Views: ${profileViews}`);

  // MERGE で upsert（dateはDATE型にキャスト）
  const query = `
    MERGE \`${PROJECT_ID}.${DATASET_ID}.threads_daily_metrics\` T
    USING (SELECT DATE(@date) as date, @followers_snapshot as followers_snapshot, @profile_views as profile_views) S
    ON T.date = S.date
    WHEN MATCHED THEN
      UPDATE SET followers_snapshot = S.followers_snapshot, profile_views = S.profile_views
    WHEN NOT MATCHED THEN
      INSERT (date, followers_snapshot, profile_views)
      VALUES (S.date, S.followers_snapshot, S.profile_views)
  `;

  await bigQueryClient.query({
    query,
    params: {
      date: dateStr,
      followers_snapshot: followersCount,
      profile_views: profileViews,
    },
  });

  console.log(`[syncThreadsFromApi] Account insights saved for ${dateStr}`);
}

async function syncPosts(bigQueryClient: BigQuery, accessToken: string): Promise<void> {
  console.log('[syncThreadsFromApi] === Syncing Posts ===');

  const posts = await getThreadsPosts(accessToken, 100);

  if (posts.length === 0) {
    console.log('[syncThreadsFromApi] No posts to sync');
    return;
  }

  console.log(`[syncThreadsFromApi] Fetched ${posts.length} posts`);

  const postsWithInsights = [];

  for (const post of posts) {
    const insights = await getPostInsights(accessToken, post.id);
    postsWithInsights.push({
      post_id: post.id,
      posted_at: post.timestamp,
      permalink: post.permalink,
      content: post.text || '',
      impressions_total: insights.views || 0,
      likes_total: insights.likes || 0,
      replies_total: insights.replies || 0,
      reposts_total: insights.reposts || 0,
      quotes_total: insights.quotes || 0,
      media_type: post.media_type,
      is_quote_post: post.is_quote_post || false,
      updated_at: new Date().toISOString(),
    });

    // API制限対策
    await sleep(300);
  }

  console.log(`[syncThreadsFromApi] Fetched insights for ${postsWithInsights.length} posts`);

  // 既存テーブルにカラム追加対応
  await ensurePostsTableColumns(bigQueryClient);

  // 既存のpost_idを取得
  const [existingRows] = await bigQueryClient.query({
    query: `SELECT post_id FROM \`${PROJECT_ID}.${DATASET_ID}.threads_posts\``,
  });
  const existingPostIds = new Set((existingRows as Array<{post_id: string}>).map(r => r.post_id));

  // 新規投稿のみINSERT
  const newPosts = postsWithInsights.filter(p => !existingPostIds.has(p.post_id));
  const existingPosts = postsWithInsights.filter(p => existingPostIds.has(p.post_id));

  console.log(`[syncThreadsFromApi] New posts: ${newPosts.length}, Existing posts to update: ${existingPosts.length}`);

  // 新規投稿をINSERT
  for (const post of newPosts) {
    const query = `
      INSERT INTO \`${PROJECT_ID}.${DATASET_ID}.threads_posts\`
      (post_id, posted_at, permalink, content, impressions_total, likes_total, replies_total, reposts_total, quotes_total, media_type, is_quote_post, updated_at)
      VALUES (@post_id, @posted_at, @permalink, @content, @impressions_total, @likes_total, @replies_total, @reposts_total, @quotes_total, @media_type, @is_quote_post, @updated_at)
    `;

    try {
      await bigQueryClient.query({
        query,
        params: post,
      });
    } catch (error) {
      console.error(`[syncThreadsFromApi] Failed to insert post ${post.post_id}:`, error);
    }
  }

  // 既存投稿のインサイトをUPDATE（streaming bufferエラーを回避するためretry）
  for (const post of existingPosts) {
    const query = `
      UPDATE \`${PROJECT_ID}.${DATASET_ID}.threads_posts\`
      SET impressions_total = @impressions_total,
          likes_total = @likes_total,
          replies_total = @replies_total,
          reposts_total = @reposts_total,
          quotes_total = @quotes_total,
          updated_at = @updated_at
      WHERE post_id = @post_id
    `;

    try {
      await bigQueryClient.query({
        query,
        params: post,
      });
    } catch (error) {
      // streaming bufferエラーは無視（数分後に再試行すれば成功する）
      if (error instanceof Error && error.message.includes('streaming buffer')) {
        console.warn(`[syncThreadsFromApi] Skipping update for ${post.post_id} (in streaming buffer)`);
      } else {
        console.error(`[syncThreadsFromApi] Failed to update post ${post.post_id}:`, error);
      }
    }
  }

  console.log(`[syncThreadsFromApi] Posts synced successfully`);
}

async function syncComments(bigQueryClient: BigQuery, accessToken: string, myUsername: string): Promise<void> {
  console.log('[syncThreadsFromApi] === Syncing Comments ===');
  console.log(`[syncThreadsFromApi] Username: ${myUsername}`);

  // まず投稿一覧を取得
  const posts = await getThreadsPosts(accessToken, 50); // コメント取得はAPI呼び出しが多いので50件に制限

  if (posts.length === 0) {
    console.log('[syncThreadsFromApi] No posts to fetch comments for');
    return;
  }

  // threads_commentsテーブルを作成
  await ensureCommentsTable(bigQueryClient);

  const allComments: ThreadsComment[] = [];

  for (const post of posts) {
    console.log(`[syncThreadsFromApi] Fetching comments for post ${post.id}...`);
    const comments = await getMyCommentTree(accessToken, post.id, myUsername);
    allComments.push(...comments);
    await sleep(500);
  }

  console.log(`[syncThreadsFromApi] Fetched ${allComments.length} comments total`);

  if (allComments.length === 0) {
    console.log('[syncThreadsFromApi] No comments to sync');
    return;
  }

  // 既存のcomment_idを取得
  const [existingRows] = await bigQueryClient.query({
    query: `SELECT comment_id FROM \`${PROJECT_ID}.${DATASET_ID}.threads_comments\``,
  });
  const existingCommentIds = new Set((existingRows as Array<{comment_id: string}>).map(r => r.comment_id));

  const newComments = allComments.filter(c => !existingCommentIds.has(c.comment_id));
  const existingComments = allComments.filter(c => existingCommentIds.has(c.comment_id));

  console.log(`[syncThreadsFromApi] New comments: ${newComments.length}, Existing comments to update: ${existingComments.length}`);

  const now = new Date().toISOString();

  // 新規コメントをINSERT
  for (const comment of newComments) {
    const query = `
      INSERT INTO \`${PROJECT_ID}.${DATASET_ID}.threads_comments\`
      (comment_id, parent_post_id, text, timestamp, permalink, has_replies, depth, views, created_at, updated_at)
      VALUES (@comment_id, @parent_post_id, @text, @timestamp, @permalink, @has_replies, @depth, @views, @created_at, @updated_at)
    `;

    try {
      await bigQueryClient.query({
        query,
        params: {
          ...comment,
          created_at: now,
          updated_at: now,
        },
      });
    } catch (error) {
      console.error(`[syncThreadsFromApi] Failed to insert comment ${comment.comment_id}:`, error);
    }
  }

  // 既存コメントのviewsをUPDATE
  for (const comment of existingComments) {
    const query = `
      UPDATE \`${PROJECT_ID}.${DATASET_ID}.threads_comments\`
      SET views = @views, updated_at = @updated_at
      WHERE comment_id = @comment_id
    `;

    try {
      await bigQueryClient.query({
        query,
        params: {
          comment_id: comment.comment_id,
          views: comment.views,
          updated_at: now,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('streaming buffer')) {
        console.warn(`[syncThreadsFromApi] Skipping update for comment ${comment.comment_id} (in streaming buffer)`);
      } else {
        console.error(`[syncThreadsFromApi] Failed to update comment ${comment.comment_id}:`, error);
      }
    }
  }

  console.log(`[syncThreadsFromApi] Comments synced successfully`);
}

// ============================================================================
// ヘルパー関数
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureCommentsTable(bigQueryClient: BigQuery): Promise<void> {
  const dataset = getDataset(bigQueryClient, DATASET_ID);
  const table = dataset.table('threads_comments');

  const [exists] = await table.exists();

  if (!exists) {
    console.log('[syncThreadsFromApi] Creating threads_comments table...');

    const schema: TableField[] = [
      { name: 'comment_id', type: 'STRING' },
      { name: 'parent_post_id', type: 'STRING' },
      { name: 'text', type: 'STRING' },
      { name: 'timestamp', type: 'TIMESTAMP' },
      { name: 'permalink', type: 'STRING' },
      { name: 'has_replies', type: 'BOOL' },
      { name: 'depth', type: 'INT64' },
      { name: 'views', type: 'INT64' },
      { name: 'created_at', type: 'TIMESTAMP' },
      { name: 'updated_at', type: 'TIMESTAMP' },
    ];

    await table.create({ schema });
    console.log('[syncThreadsFromApi] threads_comments table created');
  }
}

async function ensurePostsTableColumns(bigQueryClient: BigQuery): Promise<void> {
  const newColumns = [
    'replies_total INT64',
    'reposts_total INT64',
    'quotes_total INT64',
    'media_type STRING',
    'is_quote_post BOOL',
  ];

  for (const column of newColumns) {
    const [name] = column.split(' ');
    try {
      await bigQueryClient.query({
        query: `ALTER TABLE \`${PROJECT_ID}.${DATASET_ID}.threads_posts\` ADD COLUMN IF NOT EXISTS ${column}`,
      });
    } catch (error) {
      if (!(error instanceof Error && error.message.includes('already exists'))) {
        console.warn(`[syncThreadsFromApi] Could not add column ${name}:`, error);
      }
    }
  }
}

// ============================================================================
// メイン処理
// ============================================================================

type SyncMode = 'account' | 'posts' | 'comments' | 'all';

async function main() {
  const mode = (process.argv[2] || 'all') as SyncMode;

  console.log(`[syncThreadsFromApi] Starting sync with mode: ${mode}`);
  console.log(`[syncThreadsFromApi] THREADS_BUSINESS_ID: ${THREADS_BUSINESS_ID ? 'set' : 'NOT SET'}`);
  console.log(`[syncThreadsFromApi] THREADS_TOKEN: ${THREADS_TOKEN ? 'set' : 'NOT SET'}`);

  if (!THREADS_TOKEN) {
    throw new Error('THREADS_TOKEN is required');
  }

  // まずアカウント情報を取得してユーザー名とIDを確認
  console.log('[syncThreadsFromApi] Fetching account info...');
  const accountInfo = await getThreadsAccountInfo(THREADS_TOKEN);
  console.log(`[syncThreadsFromApi] Account: ${accountInfo.username} (ID: ${accountInfo.id})`);

  const bigQueryClient = createBigQueryClient(PROJECT_ID);

  try {
    switch (mode) {
      case 'account':
        await syncAccountInsights(bigQueryClient, THREADS_TOKEN, accountInfo.id);
        break;
      case 'posts':
        await syncPosts(bigQueryClient, THREADS_TOKEN);
        break;
      case 'comments':
        await syncComments(bigQueryClient, THREADS_TOKEN, accountInfo.username);
        break;
      case 'all':
      default:
        await syncAccountInsights(bigQueryClient, THREADS_TOKEN, accountInfo.id);
        await syncPosts(bigQueryClient, THREADS_TOKEN);
        await syncComments(bigQueryClient, THREADS_TOKEN, accountInfo.username);
        break;
    }

    console.log('[syncThreadsFromApi] Sync completed successfully');
  } catch (error) {
    console.error('[syncThreadsFromApi] Sync failed:', error);
    process.exitCode = 1;
  }
}

main();
