/**
 * スプレッドシートからBigQueryにコメントデータをバックフィルするスクリプト
 * 期間: 2025-11-28 〜 2025-12-09
 *
 * Usage:
 *   npx tsx scripts/backfill-comments-from-sheet.ts
 */

import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';

// dotenv を require で読み込み（.env.local優先）
require('dotenv').config({ path: '.env.local' });

const PROJECT_ID = 'mark-454114';
const DATASET_ID = 'autostudio_threads';
const SPREADSHEET_ID = '1FcoxqF-W_cl1wZps_mmFffp0SJH0-qOvae7VaU70-KA';

// バックフィル期間
const START_DATE = new Date('2025-11-28');
const END_DATE = new Date('2025-12-09T23:59:59');

interface SheetPost {
  postId: string;
  postedAt: string;
  url: string;
  content: string;
  views: number;
  likes: number;
  replies: number;
  quotes: number;
}

interface SheetComment {
  commentId: string;
  text: string;
  username: string;
  permalink: string;
  postedAt: string;
  hasReplies: boolean;
  parentId: string;
  views: number;
}

async function getGoogleAuth() {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');

  const jsonString = rawJson.startsWith('{') ? rawJson : Buffer.from(rawJson, 'base64').toString('utf8');
  const credentials = JSON.parse(jsonString);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
}

async function getBigQueryClient(): Promise<BigQuery> {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');

  const jsonString = rawJson.startsWith('{') ? rawJson : Buffer.from(rawJson, 'base64').toString('utf8');
  const credentials = JSON.parse(jsonString);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }

  return new BigQuery({
    projectId: PROJECT_ID,
    credentials,
    location: 'US',
  });
}

async function fetchPostsFromSheet(sheets: ReturnType<typeof google.sheets>): Promise<SheetPost[]> {
  console.log('[backfill] Fetching posts from sheet...');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'post!A:I',
  });

  const rows = response.data.values || [];
  const posts: SheetPost[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0] || !row[1]) continue;

    const postedAt = new Date(row[1]);
    if (postedAt < START_DATE || postedAt > END_DATE) continue;

    posts.push({
      postId: row[0],
      postedAt: row[1],
      url: row[2] || '',
      content: row[3] || '',
      views: parseInt(String(row[4]).replace(/,/g, '')) || 0,
      likes: parseInt(String(row[5]).replace(/,/g, '')) || 0,
      replies: parseInt(String(row[6]).replace(/,/g, '')) || 0,
      quotes: parseInt(String(row[7]).replace(/,/g, '')) || 0,
    });
  }

  console.log(`[backfill] Found ${posts.length} posts in date range`);
  return posts;
}

async function fetchCommentsFromSheet(sheets: ReturnType<typeof google.sheets>): Promise<SheetComment[]> {
  console.log('[backfill] Fetching comments from sheet...');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'comment!A:I',
  });

  const rows = response.data.values || [];
  const comments: SheetComment[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0] || !row[4]) continue;

    const postedAt = new Date(row[4]);
    if (postedAt < START_DATE || postedAt > END_DATE) continue;

    // 閲覧数がN/Aや空の場合はスキップ
    const viewsStr = row[7];
    if (!viewsStr || viewsStr === 'N/A' || viewsStr === '') continue;

    const views = parseInt(String(viewsStr).replace(/,/g, '')) || 0;

    comments.push({
      commentId: row[0],
      text: row[1] || '',
      username: row[2] || '',
      permalink: row[3] || '',
      postedAt: row[4],
      hasReplies: row[5] === 'TRUE',
      parentId: row[6] || '',
      views,
    });
  }

  console.log(`[backfill] Found ${comments.length} comments with views in date range`);
  return comments;
}

async function getExistingPostIds(client: BigQuery): Promise<Set<string>> {
  console.log('[backfill] Checking existing posts in BigQuery...');

  const [rows] = await client.query({
    query: `SELECT post_id FROM \`${PROJECT_ID}.${DATASET_ID}.threads_posts\``,
  });

  return new Set((rows as Array<{ post_id: string }>).map((r) => r.post_id));
}

async function getExistingCommentIds(client: BigQuery): Promise<Set<string>> {
  console.log('[backfill] Checking existing comments in BigQuery...');

  const [rows] = await client.query({
    query: `SELECT comment_id FROM \`${PROJECT_ID}.${DATASET_ID}.threads_comments\``,
  });

  return new Set((rows as Array<{ comment_id: string }>).map((r) => r.comment_id));
}

async function insertPosts(client: BigQuery, posts: SheetPost[], existingIds: Set<string>): Promise<void> {
  const newPosts = posts.filter((p) => !existingIds.has(p.postId));
  console.log(`[backfill] Inserting ${newPosts.length} new posts (${posts.length - newPosts.length} already exist)`);

  for (const post of newPosts) {
    try {
      await client.query({
        query: `
          INSERT INTO \`${PROJECT_ID}.${DATASET_ID}.threads_posts\`
          (post_id, posted_at, permalink, content, impressions_total, likes_total, replies_total, quotes_total, updated_at)
          VALUES (@post_id, @posted_at, @permalink, @content, @impressions_total, @likes_total, @replies_total, @quotes_total, @updated_at)
        `,
        params: {
          post_id: post.postId,
          posted_at: post.postedAt,
          permalink: post.url,
          content: post.content,
          impressions_total: post.views,
          likes_total: post.likes,
          replies_total: post.replies,
          quotes_total: post.quotes,
          updated_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error(`[backfill] Failed to insert post ${post.postId}:`, error);
    }
  }

  // 既存投稿のインプレッションを更新
  const existingPosts = posts.filter((p) => existingIds.has(p.postId));
  console.log(`[backfill] Updating ${existingPosts.length} existing posts`);

  for (const post of existingPosts) {
    try {
      await client.query({
        query: `
          UPDATE \`${PROJECT_ID}.${DATASET_ID}.threads_posts\`
          SET impressions_total = @impressions_total,
              likes_total = @likes_total,
              replies_total = @replies_total,
              quotes_total = @quotes_total,
              updated_at = @updated_at
          WHERE post_id = @post_id
        `,
        params: {
          post_id: post.postId,
          impressions_total: post.views,
          likes_total: post.likes,
          replies_total: post.replies,
          quotes_total: post.quotes,
          updated_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('streaming buffer')) {
        console.warn(`[backfill] Skipping update for ${post.postId} (in streaming buffer)`);
      } else {
        console.error(`[backfill] Failed to update post ${post.postId}:`, error);
      }
    }
  }
}

async function insertComments(
  client: BigQuery,
  comments: SheetComment[],
  existingIds: Set<string>,
  postIds: Set<string>
): Promise<void> {
  // parent_post_idを特定するためのマッピングを作成
  // コメントの返信先IDがメイン投稿IDか、別のコメントIDかを判定
  const commentIdSet = new Set(comments.map((c) => c.commentId));

  // 親投稿IDを解決（返信先IDがpostIdsに含まれていればそのまま、なければコメントチェーンを辿る）
  const resolveRootPostId = (comment: SheetComment, visited = new Set<string>()): string | null => {
    if (visited.has(comment.commentId)) return null; // 循環参照防止
    visited.add(comment.commentId);

    if (postIds.has(comment.parentId)) {
      return comment.parentId;
    }

    // 親がコメントの場合、そのコメントの親を辿る
    const parentComment = comments.find((c) => c.commentId === comment.parentId);
    if (parentComment) {
      return resolveRootPostId(parentComment, visited);
    }

    return null;
  };

  const commentsWithRootPost = comments.map((c) => ({
    ...c,
    rootPostId: resolveRootPostId(c),
  }));

  const validComments = commentsWithRootPost.filter((c) => c.rootPostId !== null);
  console.log(
    `[backfill] ${validComments.length} comments have valid root post ID (${comments.length - validComments.length} skipped)`
  );

  const newComments = validComments.filter((c) => !existingIds.has(c.commentId));
  console.log(`[backfill] Inserting ${newComments.length} new comments (${validComments.length - newComments.length} already exist)`);

  const now = new Date().toISOString();

  for (const comment of newComments) {
    // depthを計算（親がpostならdepth=0、親がcommentならその親のdepth+1）
    let depth = 0;
    if (commentIdSet.has(comment.parentId)) {
      // 親がコメントの場合、チェーンの深さを計算
      let currentParentId = comment.parentId;
      while (commentIdSet.has(currentParentId)) {
        depth++;
        const parent = comments.find((c) => c.commentId === currentParentId);
        if (!parent) break;
        currentParentId = parent.parentId;
      }
    }

    try {
      await client.query({
        query: `
          INSERT INTO \`${PROJECT_ID}.${DATASET_ID}.threads_comments\`
          (comment_id, parent_post_id, text, timestamp, permalink, has_replies, depth, views, created_at, updated_at)
          VALUES (@comment_id, @parent_post_id, @text, @timestamp, @permalink, @has_replies, @depth, @views, @created_at, @updated_at)
        `,
        params: {
          comment_id: comment.commentId,
          parent_post_id: comment.rootPostId,
          text: comment.text,
          timestamp: comment.postedAt,
          permalink: comment.permalink,
          has_replies: comment.hasReplies,
          depth,
          views: comment.views,
          created_at: now,
          updated_at: now,
        },
      });
    } catch (error) {
      console.error(`[backfill] Failed to insert comment ${comment.commentId}:`, error);
    }
  }

  // 既存コメントのviewsを更新
  const existingComments = validComments.filter((c) => existingIds.has(c.commentId));
  console.log(`[backfill] Updating ${existingComments.length} existing comments`);

  for (const comment of existingComments) {
    try {
      await client.query({
        query: `
          UPDATE \`${PROJECT_ID}.${DATASET_ID}.threads_comments\`
          SET views = @views, updated_at = @updated_at
          WHERE comment_id = @comment_id
        `,
        params: {
          comment_id: comment.commentId,
          views: comment.views,
          updated_at: now,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('streaming buffer')) {
        console.warn(`[backfill] Skipping update for comment ${comment.commentId} (in streaming buffer)`);
      } else {
        console.error(`[backfill] Failed to update comment ${comment.commentId}:`, error);
      }
    }
  }
}

async function main() {
  console.log('[backfill] Starting backfill from spreadsheet to BigQuery');
  console.log(`[backfill] Date range: ${START_DATE.toISOString().split('T')[0]} to ${END_DATE.toISOString().split('T')[0]}`);

  const auth = await getGoogleAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const bigquery = await getBigQueryClient();

  // スプレッドシートからデータ取得
  const posts = await fetchPostsFromSheet(sheets);
  const comments = await fetchCommentsFromSheet(sheets);

  // BigQueryの既存データ確認
  const existingPostIds = await getExistingPostIds(bigquery);
  const existingCommentIds = await getExistingCommentIds(bigquery);

  // 投稿をBigQueryに挿入/更新
  await insertPosts(bigquery, posts, existingPostIds);

  // 投稿IDのセット（コメントの親投稿ID解決用）
  const allPostIds = new Set([...existingPostIds, ...posts.map((p) => p.postId)]);

  // コメントをBigQueryに挿入/更新
  await insertComments(bigquery, comments, existingCommentIds, allPostIds);

  console.log('[backfill] Backfill completed!');
}

main().catch(console.error);
