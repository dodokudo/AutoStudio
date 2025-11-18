/**
 * Threads API link_attachment テストスクリプト
 *
 * 使い方:
 * npx ts-node scripts/testThreadsLinkAttachment.ts
 */

import { config as loadEnv } from 'dotenv';
import path from 'node:path';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

const GRAPH_BASE = 'https://graph.threads.net/v1.0';
const THREADS_TOKEN = process.env.THREADS_TOKEN?.trim();
const THREADS_BUSINESS_ID = process.env.THREADS_BUSINESS_ID?.trim();

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
  const text = await res.text();
  console.log(`[${res.status}] ${text}`);
  return { ok: res.ok, status: res.status, data: text };
}

async function testLinkAttachment() {
  console.log('=== Threads API link_attachment テスト ===\n');

  if (!THREADS_TOKEN || !THREADS_BUSINESS_ID) {
    console.error('❌ THREADS_TOKEN または THREADS_BUSINESS_ID が設定されていません');
    return;
  }

  console.log(`Business ID: ${THREADS_BUSINESS_ID}`);
  console.log('');

  // テスト1: シンプルなURL（example.com）でメイン投稿
  console.log('--- テスト1: メイン投稿 + example.com ---');
  const test1Body = {
    text: 'テスト投稿です',
    media_type: 'TEXT',
    link_attachment: 'https://example.com',
  };
  console.log('送信内容:', JSON.stringify(test1Body, null, 2));

  const result1 = await request(`${THREADS_BUSINESS_ID}/threads`, {
    method: 'POST',
    body: JSON.stringify(test1Body),
  });

  if (result1.ok) {
    console.log('✅ テスト1 成功!\n');
  } else {
    console.log('❌ テスト1 失敗\n');
  }

  // テスト2: threads.com のURLでメイン投稿
  console.log('--- テスト2: メイン投稿 + threads.com URL ---');
  const test2Body = {
    text: 'これ必見です▼',
    media_type: 'TEXT',
    link_attachment: 'https://www.threads.com/@kudooo_ai/post/DRJ8QHxCciW',
  };
  console.log('送信内容:', JSON.stringify(test2Body, null, 2));

  const result2 = await request(`${THREADS_BUSINESS_ID}/threads`, {
    method: 'POST',
    body: JSON.stringify(test2Body),
  });

  if (result2.ok) {
    console.log('✅ テスト2 成功!\n');
  } else {
    console.log('❌ テスト2 失敗\n');
  }

  // テスト3: リプライ（コメント）+ link_attachment
  // 注意: 実際の投稿IDが必要
  const replyToId = process.argv[2]; // コマンドライン引数から取得

  if (replyToId) {
    console.log('--- テスト3: リプライ + link_attachment ---');
    const test3Body = {
      text: 'これ必見です▼',
      media_type: 'TEXT',
      link_attachment: 'https://www.threads.com/@kudooo_ai/post/DRJ8QHxCciW',
      reply_to_id: replyToId,
    };
    console.log('送信内容:', JSON.stringify(test3Body, null, 2));

    const result3 = await request(`${THREADS_BUSINESS_ID}/threads`, {
      method: 'POST',
      body: JSON.stringify(test3Body),
    });

    if (result3.ok) {
      console.log('✅ テスト3 成功! → リプライでも link_attachment 使える!\n');
    } else {
      console.log('❌ テスト3 失敗 → リプライでは link_attachment 使えない\n');
    }
  } else {
    console.log('\n--- テスト3: リプライ + link_attachment ---');
    console.log('スキップ: リプライ先の投稿IDを指定してください');
    console.log('使い方: npx ts-node scripts/testThreadsLinkAttachment.ts [投稿ID]');
    console.log('例: npx ts-node scripts/testThreadsLinkAttachment.ts 17841234567890123');
  }

  console.log('\n=== テスト完了 ===');
  console.log('注意: 成功した場合、コンテナが作成されますが、まだ公開されません。');
}

testLinkAttachment().catch(console.error);
