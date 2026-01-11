/**
 * コメント欄の順序ベース遷移分析
 * コメント欄1, 2, 3はtimestamp順で決定（depth=0で全て同じ親投稿への直接返信）
 */

import { BigQuery } from '@google-cloud/bigquery';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.prod') });

const PROJECT_ID = 'mark-454114';

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

interface CommentWithOrder {
  comment_id: string;
  parent_post_id: string;
  timestamp: string;
  views: number;
  text: string;
  comment_order: number; // 1, 2, 3...
}

interface PostWithComments {
  post_id: string;
  posted_at: string;
  content: string;
  impressions: number;
  comments: CommentWithOrder[];
}

async function analyze() {
  const bigquery = await getBigQueryClient();

  // 投稿データを取得
  console.log('投稿データを取得中...');
  const [postRows] = await bigquery.query({
    query: `
      SELECT
        post_id,
        CAST(posted_at AS STRING) as posted_at,
        content,
        impressions_total as impressions
      FROM \`${PROJECT_ID}.autostudio_threads.threads_posts\`
      WHERE DATE(posted_at) BETWEEN '2025-11-28' AND '2025-12-11'
    `
  });

  const posts = new Map<string, PostWithComments>();
  for (const r of postRows as Array<{ post_id: string; posted_at: string; content: string; impressions: number }>) {
    posts.set(r.post_id, {
      post_id: r.post_id,
      posted_at: r.posted_at,
      content: r.content || '',
      impressions: Number(r.impressions),
      comments: []
    });
  }
  console.log(`投稿数: ${posts.size}`);

  // コメントデータを取得（timestamp順）
  console.log('コメントデータを取得中...');
  const [commentRows] = await bigquery.query({
    query: `
      SELECT
        comment_id,
        parent_post_id,
        CAST(timestamp AS STRING) as timestamp,
        views,
        text
      FROM \`${PROJECT_ID}.autostudio_threads.threads_comments\`
      WHERE DATE(timestamp) BETWEEN '2025-11-28' AND '2025-12-11'
      ORDER BY parent_post_id, timestamp ASC
    `
  });

  // 各投稿のコメントを順序付けて格納
  const commentsByPost = new Map<string, CommentWithOrder[]>();
  for (const r of commentRows as Array<{ comment_id: string; parent_post_id: string; timestamp: string; views: number; text: string }>) {
    if (!commentsByPost.has(r.parent_post_id)) {
      commentsByPost.set(r.parent_post_id, []);
    }
    const arr = commentsByPost.get(r.parent_post_id)!;
    arr.push({
      comment_id: r.comment_id,
      parent_post_id: r.parent_post_id,
      timestamp: r.timestamp,
      views: Number(r.views),
      text: r.text || '',
      comment_order: arr.length + 1
    });
  }

  // 投稿にコメントを紐付け
  for (const [postId, comments] of commentsByPost) {
    if (posts.has(postId)) {
      posts.get(postId)!.comments = comments;
    }
  }

  console.log(`コメント付き投稿数: ${commentsByPost.size}`);

  // コメント欄2があるポストを抽出
  const postsWithComment2: PostWithComments[] = [];
  for (const post of posts.values()) {
    if (post.comments.length >= 2) {
      postsWithComment2.push(post);
    }
  }

  console.log(`コメント欄2がある投稿数: ${postsWithComment2.length}`);

  // 遷移率を計算
  interface TransitionData {
    post: PostWithComments;
    comment1Views: number;
    comment2Views: number;
    transitionRate: number; // コメント2閲覧 / メイン投稿インプレッション
  }

  const transitionData: TransitionData[] = postsWithComment2.map(post => {
    const comment1 = post.comments.find(c => c.comment_order === 1);
    const comment2 = post.comments.find(c => c.comment_order === 2);
    return {
      post,
      comment1Views: comment1?.views || 0,
      comment2Views: comment2?.views || 0,
      transitionRate: post.impressions > 0 ? ((comment2?.views || 0) / post.impressions) * 100 : 0
    };
  });

  // 出力
  console.log('\n');
  console.log('='.repeat(110));
  console.log('メイン投稿 → コメント欄2 遷移分析（順序ベース）');
  console.log('期間: 2025-11-28 〜 2025-12-11');
  console.log('='.repeat(110));

  // 遷移率TOP20
  console.log('\n');
  console.log('='.repeat(110));
  console.log('【1】遷移率TOP20（コメント欄2閲覧数 ÷ メイン投稿インプレッション）');
  console.log('='.repeat(110));
  console.log('順位  投稿日時              インプ    コメ1    コメ2    遷移率%  内容');
  console.log('-'.repeat(110));

  const byRate = [...transitionData]
    .filter(d => d.comment2Views > 0)
    .sort((a, b) => b.transitionRate - a.transitionRate);

  byRate.slice(0, 20).forEach((d, i) => {
    const content = d.post.content.replace(/\n/g, ' ').substring(0, 50);
    console.log(
      String(i + 1).padStart(2) + '    ' +
      d.post.posted_at.substring(0, 16).padEnd(18) +
      String(d.post.impressions.toLocaleString()).padStart(8) +
      String(d.comment1Views.toLocaleString()).padStart(9) +
      String(d.comment2Views.toLocaleString()).padStart(9) +
      d.transitionRate.toFixed(2).padStart(10) +
      '  ' + content + '...'
    );
  });

  // 遷移数TOP20
  console.log('\n');
  console.log('='.repeat(110));
  console.log('【2】遷移数TOP20（コメント欄2閲覧数の絶対数）');
  console.log('='.repeat(110));
  console.log('順位  投稿日時              インプ    コメ1    コメ2    遷移率%  内容');
  console.log('-'.repeat(110));

  const byCount = [...transitionData]
    .filter(d => d.comment2Views > 0)
    .sort((a, b) => b.comment2Views - a.comment2Views);

  byCount.slice(0, 20).forEach((d, i) => {
    const content = d.post.content.replace(/\n/g, ' ').substring(0, 50);
    console.log(
      String(i + 1).padStart(2) + '    ' +
      d.post.posted_at.substring(0, 16).padEnd(18) +
      String(d.post.impressions.toLocaleString()).padStart(8) +
      String(d.comment1Views.toLocaleString()).padStart(9) +
      String(d.comment2Views.toLocaleString()).padStart(9) +
      d.transitionRate.toFixed(2).padStart(10) +
      '  ' + content + '...'
    );
  });

  // 両方TOP20に入っている投稿
  const topRateIds = new Set(byRate.slice(0, 20).map(d => d.post.post_id));
  const topCountIds = new Set(byCount.slice(0, 20).map(d => d.post.post_id));
  const bothTop = byRate.filter(d => topRateIds.has(d.post.post_id) && topCountIds.has(d.post.post_id));

  console.log('\n');
  console.log('='.repeat(110));
  console.log('【3】遷移率・遷移数 両方TOP20に入っている投稿（' + bothTop.length + '件）');
  console.log('='.repeat(110));

  if (bothTop.length > 0) {
    console.log('順位  投稿日時              インプ    コメ1    コメ2    遷移率%  内容');
    console.log('-'.repeat(110));
    bothTop.forEach((d, i) => {
      const content = d.post.content.replace(/\n/g, ' ').substring(0, 50);
      console.log(
        String(i + 1).padStart(2) + '    ' +
        d.post.posted_at.substring(0, 16).padEnd(18) +
        String(d.post.impressions.toLocaleString()).padStart(8) +
        String(d.comment1Views.toLocaleString()).padStart(9) +
        String(d.comment2Views.toLocaleString()).padStart(9) +
        d.transitionRate.toFixed(2).padStart(10) +
        '  ' + content + '...'
      );
    });
  }

  // サマリー統計
  const validData = transitionData.filter(d => d.comment2Views > 0);
  const totalImpressions = validData.reduce((s, d) => s + d.post.impressions, 0);
  const totalComment1 = validData.reduce((s, d) => s + d.comment1Views, 0);
  const totalComment2 = validData.reduce((s, d) => s + d.comment2Views, 0);

  console.log('\n');
  console.log('='.repeat(110));
  console.log('【4】全体サマリー');
  console.log('='.repeat(110));
  console.log('コメント欄2があるポスト数: ' + postsWithComment2.length + '件');
  console.log('うちコメント欄2の閲覧が1以上: ' + validData.length + '件');
  console.log('');
  console.log('合計インプレッション: ' + totalImpressions.toLocaleString());
  console.log('合計コメント欄1閲覧: ' + totalComment1.toLocaleString() + ' (' + (totalComment1 / totalImpressions * 100).toFixed(2) + '%)');
  console.log('合計コメント欄2閲覧: ' + totalComment2.toLocaleString() + ' (' + (totalComment2 / totalImpressions * 100).toFixed(2) + '%)');
  console.log('');
  console.log('コメント1→コメント2 遷移率: ' + (totalComment2 / totalComment1 * 100).toFixed(2) + '%');

  // コメント欄の構造確認（サンプル）
  console.log('\n');
  console.log('='.repeat(110));
  console.log('【5】コメント構造サンプル（TOP5投稿）');
  console.log('='.repeat(110));

  byCount.slice(0, 5).forEach(d => {
    console.log('\n■ 投稿ID: ' + d.post.post_id);
    console.log('  投稿内容: ' + d.post.content.replace(/\n/g, ' ').substring(0, 60) + '...');
    console.log('  インプレッション: ' + d.post.impressions.toLocaleString());
    d.post.comments.forEach(c => {
      const isCta = c.text.toLowerCase().includes('autostudio-self.vercel.app');
      const ctaLabel = isCta ? ' ★CTA' : '';
      console.log(`  コメント${c.comment_order} [views:${c.views}]${ctaLabel} - ${c.text.replace(/\n/g, ' ').substring(0, 40)}...`);
    });
  });
}

analyze().catch(console.error);
