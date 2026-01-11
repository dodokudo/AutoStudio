/**
 * コメントのdepthを修正するスクリプト
 * スプレッドシートの返信先IDを元に正しいdepthを計算して更新
 */

import { google } from 'googleapis';
import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.prod') });

const PROJECT_ID = 'mark-454114';
const DATASET_ID = 'autostudio_threads';
const SPREADSHEET_ID = '1FcoxqF-W_cl1wZps_mmFffp0SJH0-qOvae7VaU70-KA';

const START_DATE = new Date('2025-11-28');
const END_DATE = new Date('2025-12-09T23:59:59');

async function getCredentials() {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON not set');

  const jsonString = rawJson.startsWith('{') ? rawJson : Buffer.from(rawJson, 'base64').toString('utf8');
  const credentials = JSON.parse(jsonString);
  if (credentials.private_key) {
    credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
  }
  return credentials;
}

interface CommentData {
  commentId: string;
  parentId: string;
  postedAt: string;
}

async function main() {
  console.log('[fix-depth] Starting depth fix...');

  const credentials = await getCredentials();

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

  // 投稿IDを取得
  console.log('[fix-depth] Fetching post IDs from spreadsheet...');
  const postResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'post!A:A',
  });
  const postIds = new Set((postResponse.data.values || []).slice(1).map(r => r[0]).filter(Boolean));
  console.log(`[fix-depth] Found ${postIds.size} posts`);

  // コメントデータを取得
  console.log('[fix-depth] Fetching comments from spreadsheet...');
  const commentResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'comment!A:H',
  });

  const rows = commentResponse.data.values || [];
  const comments: CommentData[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0] || !row[4]) continue;

    const postedAt = new Date(row[4]);
    if (postedAt < START_DATE || postedAt > END_DATE) continue;

    comments.push({
      commentId: row[0],
      parentId: row[6] || '',
      postedAt: row[4],
    });
  }

  console.log(`[fix-depth] Found ${comments.length} comments in date range`);

  // コメントIDのセット
  const commentIdSet = new Set(comments.map(c => c.commentId));

  // depthを計算
  const calculateDepth = (comment: CommentData, visited = new Set<string>()): number => {
    if (visited.has(comment.commentId)) return 0; // 循環参照防止
    visited.add(comment.commentId);

    // 親が投稿なら depth=0
    if (postIds.has(comment.parentId)) {
      return 0;
    }

    // 親がコメントなら、その親のdepth + 1
    if (commentIdSet.has(comment.parentId)) {
      const parentComment = comments.find(c => c.commentId === comment.parentId);
      if (parentComment) {
        return calculateDepth(parentComment, visited) + 1;
      }
    }

    // 不明な場合はdepth=0
    return 0;
  };

  // 各コメントのdepthを計算
  const depthMap = new Map<string, number>();
  let depth0Count = 0;
  let depth1Count = 0;
  let depth2PlusCount = 0;

  for (const comment of comments) {
    const depth = calculateDepth(comment);
    depthMap.set(comment.commentId, depth);

    if (depth === 0) depth0Count++;
    else if (depth === 1) depth1Count++;
    else depth2PlusCount++;
  }

  console.log(`[fix-depth] Depth distribution:`);
  console.log(`  depth=0: ${depth0Count}`);
  console.log(`  depth=1: ${depth1Count}`);
  console.log(`  depth>=2: ${depth2PlusCount}`);

  // BigQueryを更新
  console.log('[fix-depth] Updating BigQuery...');

  const needsUpdate = comments.filter(c => depthMap.get(c.commentId)! > 0);
  console.log(`[fix-depth] ${needsUpdate.length} comments need depth update`);

  let updated = 0;
  let failed = 0;

  for (const comment of needsUpdate) {
    const depth = depthMap.get(comment.commentId)!;

    try {
      await bigquery.query({
        query: `
          UPDATE \`${PROJECT_ID}.${DATASET_ID}.threads_comments\`
          SET depth = @depth
          WHERE comment_id = @comment_id
        `,
        params: {
          comment_id: comment.commentId,
          depth: depth,
        },
      });
      updated++;
      console.log(`[fix-depth] Updated ${comment.commentId} to depth=${depth}`);
    } catch (error: any) {
      if (error.message?.includes('streaming buffer')) {
        console.warn(`[fix-depth] Skipping ${comment.commentId} (in streaming buffer)`);
      } else {
        console.error(`[fix-depth] Failed to update ${comment.commentId}:`, error.message);
        failed++;
      }
    }

    // レートリミット対策
    if (updated % 10 === 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  console.log(`[fix-depth] Done! Updated: ${updated}, Failed: ${failed}`);
}

main().catch(console.error);
