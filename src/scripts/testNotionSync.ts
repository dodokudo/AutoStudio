import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { createNotionClient, getNotionContentDatabaseId, upsertContentPage } from '@/lib/notion';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const notionClient = createNotionClient();
  const databaseId = getNotionContentDatabaseId();
  const contentId = `notion-test-${randomUUID()}`;
  const now = new Date().toISOString();

  const body = [
    '【テスト台本】',
    'これは upsertContentPage の疎通確認用のダミー原稿です。',
    '',
    '【サンプル構成】',
    '1. 導入',
    '2. 本編',
    '3. まとめ',
  ].join('\n');

  const pageId = await upsertContentPage(notionClient, databaseId, {
    autoStudioId: contentId,
    title: 'テスト: AutoStudio 連携確認',
    media: 'YouTube',
    contentType: 'Script Draft',
    status: '未着手',
    themeKeyword: 'テストテーマ',
    generatedAt: now,
    body,
  });

  console.log('Notionページを作成/更新しました:', pageId);
}

main().catch((error) => {
  console.error('[testNotionSync] Failed:', error);
  process.exitCode = 1;
});
