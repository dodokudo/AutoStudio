/**
 * スプレッドシートからBigQueryにコメントデータをバックフィルするスクリプト
 * 期間: 2025-11-28 〜 2025-12-09
 *
 * Usage:
 *   node scripts/backfill-comments-from-sheet.js
 */

const { google } = require('googleapis');
const { BigQuery } = require('@google-cloud/bigquery');
require('dotenv').config({ path: '.env.local' });

const PROJECT_ID = 'mark-454114';
const DATASET_ID = 'autostudio_threads';
const SPREADSHEET_ID = '1FcoxqF-W_cl1wZps_mmFffp0SJH0-qOvae7VaU70-KA';

// バックフィル期間
const START_DATE = new Date('2025-11-28');
const END_DATE = new Date('2025-12-09T23:59:59');

// 認証情報を取得
const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
let credentials;
if (rawJson) {
  const jsonString = rawJson.startsWith('{') ? rawJson : Buffer.from(rawJson, 'base64').toString('utf8');
  credentials = JSON.parse(jsonString);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }
}

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

const bigquery = new BigQuery({
  projectId: PROJECT_ID,
  credentials,
  location: 'US',
});

async function fetchPostsFromSheet() {
  console.log('[backfill] Fetching posts from sheet...');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'post!A:I',
  });

  const rows = response.data.values || [];
  const posts = [];

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

async function fetchCommentsFromSheet() {
  console.log('[backfill] Fetching comments from sheet...');

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'comment!A:I',
  });

  const rows = response.data.values || [];
  const comments = [];

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

async function getExistingPostIds() {
  console.log('[backfill] Checking existing posts in BigQuery...');

  const [rows] = await bigquery.query({
    query: `SELECT post_id FROM \`${PROJECT_ID}.${DATASET_ID}.threads_posts\``,
  });

  return new Set(rows.map((r) => r.post_id));
}

async function getExistingCommentIds() {
  console.log('[backfill] Checking existing comments in BigQuery...');

  const [rows] = await bigquery.query({
    query: `SELECT comment_id FROM \`${PROJECT_ID}.${DATASET_ID}.threads_comments\``,
  });

  return new Set(rows.map((r) => r.comment_id));
}

async function insertPosts(posts, existingIds) {
  const newPosts = posts.filter((p) => !existingIds.has(p.postId));
  console.log(`[backfill] Inserting ${newPosts.length} new posts (${posts.length - newPosts.length} already exist)`);

  for (const post of newPosts) {
    try {
      await bigquery.query({
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
      console.log(`[backfill] Inserted post ${post.postId}`);
    } catch (error) {
      console.error(`[backfill] Failed to insert post ${post.postId}:`, error.message);
    }
  }

  // 既存投稿のインプレッションを更新
  const existingPosts = posts.filter((p) => existingIds.has(p.postId));
  console.log(`[backfill] Updating ${existingPosts.length} existing posts`);

  for (const post of existingPosts) {
    try {
      await bigquery.query({
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
      if (error.message && error.message.includes('streaming buffer')) {
        console.warn(`[backfill] Skipping update for ${post.postId} (in streaming buffer)`);
      } else {
        console.error(`[backfill] Failed to update post ${post.postId}:`, error.message);
      }
    }
  }
}

// タイムスタンプを ISO 形式に変換
function convertTimestamp(dateStr) {
  // "2025/11/28 23:51:03" -> "2025-11-28T23:51:03+09:00"
  if (!dateStr) return null;
  const match = dateStr.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})/);
  if (match) {
    const [, year, month, day, hour, min, sec] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${min}:${sec}+09:00`;
  }
  return dateStr;
}

async function insertComments(comments, existingIds, postIds) {
  // コメントIDのセット
  const commentIdSet = new Set(comments.map((c) => c.commentId));

  // 親投稿IDを解決（返信先IDがpostIdsに含まれていればそのまま、なければコメントチェーンを辿る）
  const resolveRootPostId = (comment, visited = new Set()) => {
    if (visited.has(comment.commentId)) return null;
    visited.add(comment.commentId);

    if (postIds.has(comment.parentId)) {
      return comment.parentId;
    }

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

  // バッチでINSERT（10件ずつ、500ms間隔）
  const batchSize = 10;
  for (let i = 0; i < newComments.length; i += batchSize) {
    const batch = newComments.slice(i, i + batchSize);

    for (const comment of batch) {
      // depthを計算
      let depth = 0;
      if (commentIdSet.has(comment.parentId)) {
        let currentParentId = comment.parentId;
        while (commentIdSet.has(currentParentId)) {
          depth++;
          const parent = comments.find((c) => c.commentId === currentParentId);
          if (!parent) break;
          currentParentId = parent.parentId;
        }
      }

      const isoTimestamp = convertTimestamp(comment.postedAt);

      try {
        await bigquery.query({
          query: `
            INSERT INTO \`${PROJECT_ID}.${DATASET_ID}.threads_comments\`
            (comment_id, parent_post_id, text, timestamp, permalink, has_replies, depth, views, created_at, updated_at)
            VALUES (@comment_id, @parent_post_id, @text, TIMESTAMP(@timestamp), @permalink, @has_replies, @depth, @views, @created_at, @updated_at)
          `,
          params: {
            comment_id: comment.commentId,
            parent_post_id: comment.rootPostId,
            text: comment.text,
            timestamp: isoTimestamp,
            permalink: comment.permalink,
            has_replies: comment.hasReplies,
            depth,
            views: comment.views,
            created_at: now,
            updated_at: now,
          },
        });
        console.log(`[backfill] Inserted comment ${comment.commentId} (views: ${comment.views})`);
      } catch (error) {
        console.error(`[backfill] Failed to insert comment ${comment.commentId}:`, error.message);
      }
    }

    // レートリミット対策：バッチ間で500ms待機
    if (i + batchSize < newComments.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // 既存コメントのviewsを更新
  const existingComments = validComments.filter((c) => existingIds.has(c.commentId));
  console.log(`[backfill] Updating ${existingComments.length} existing comments`);

  for (const comment of existingComments) {
    try {
      await bigquery.query({
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
      if (error.message && error.message.includes('streaming buffer')) {
        console.warn(`[backfill] Skipping update for comment ${comment.commentId}`);
      } else {
        console.error(`[backfill] Failed to update comment ${comment.commentId}:`, error.message);
      }
    }
  }
}

async function main() {
  console.log('[backfill] Starting backfill from spreadsheet to BigQuery');
  console.log(`[backfill] Date range: ${START_DATE.toISOString().split('T')[0]} to ${END_DATE.toISOString().split('T')[0]}`);

  // スプレッドシートからデータ取得
  const posts = await fetchPostsFromSheet();
  const comments = await fetchCommentsFromSheet();

  // BigQueryの既存データ確認
  const existingPostIds = await getExistingPostIds();
  const existingCommentIds = await getExistingCommentIds();

  // 投稿をBigQueryに挿入/更新
  await insertPosts(posts, existingPostIds);

  // 投稿IDのセット（コメントの親投稿ID解決用）
  const allPostIds = new Set([...existingPostIds, ...posts.map((p) => p.postId)]);

  // コメントをBigQueryに挿入/更新
  await insertComments(comments, existingCommentIds, allPostIds);

  console.log('[backfill] Backfill completed!');
}

main().catch(console.error);
