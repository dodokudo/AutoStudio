import { NextRequest, NextResponse } from 'next/server';
import { createNotionClient, getNotionContentDatabaseId, upsertContentPage } from '@/lib/notion';
import { randomUUID } from 'node:crypto';

interface GenerateScriptRequest {
  themeKeyword: string;
  targetPersona?: string;
  sourceVideos?: string[];
}

function ensureEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set`);
  }
  return value;
}

async function generateScript(themeKeyword: string, targetPersona?: string, sourceVideos?: string[]): Promise<string> {
  const claudeApiUrl = ensureEnv('CLAUDE_API_URL');
  const claudeApiKey = ensureEnv('CLAUDE_API_KEY');
  const claudeModel = ensureEnv('CLAUDE_MODEL');

  const prompt = `
あなたはYouTube動画の台本作成の専門家です。以下の条件に基づいて、魅力的な動画台本を作成してください。

## 条件
- テーマキーワード: ${themeKeyword}
${targetPersona ? `- ターゲット視聴者: ${targetPersona}` : ''}
${sourceVideos?.length ? `- 参考動画: ${sourceVideos.join(', ')}` : ''}

## 台本の構成
1. **フック（0-15秒）**: 視聴者の注意を引く冒頭
2. **導入（15-45秒）**: 問題提起と今日の内容予告
3. **本編（2-8分）**: メインコンテンツを3-4つのポイントに分けて解説
4. **まとめ（30-60秒）**: 要点整理とCTA（チャンネル登録・コメント促進）

## 要件
- 視聴者が最後まで見たくなる構成
- 具体例や体験談を含める
- 実用的で即効性のある情報
- エンゲージメントを高める要素（質問投げかけ、コメント促進）
- 8-10分程度の尺

台本を作成してください：
`;

  const response = await fetch(claudeApiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': claudeApiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: claudeModel,
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateScriptRequest = await request.json();
    const { themeKeyword, targetPersona, sourceVideos } = body;

    if (!themeKeyword) {
      return NextResponse.json(
        { error: 'テーマキーワードは必須です' },
        { status: 400 }
      );
    }

    // Claude APIで台本生成
    const script = await generateScript(themeKeyword, targetPersona, sourceVideos);

    // Notionに保存
    const notionClient = createNotionClient();
    const databaseId = getNotionContentDatabaseId();
    const contentId = `youtube-script-${randomUUID()}`;
    const now = new Date().toISOString();

    const pageId = await upsertContentPage(notionClient, databaseId, {
      autoStudioId: contentId,
      title: `YouTube台本: ${themeKeyword}`,
      media: sourceVideos?.length ? sourceVideos[0] : '',
      contentType: 'YouTube台本',
      status: '未着手',
      targetPersona: targetPersona ? [targetPersona] : undefined,
      themeKeyword,
      sourceUrls: sourceVideos,
      generatedAt: now,
      templateName: 'YouTube動画台本テンプレート',
      body: script,
    });

    return NextResponse.json({
      success: true,
      contentId,
      pageId,
      script,
      themeKeyword,
      message: 'YouTube台本を生成してNotionに保存しました',
    });

  } catch (error) {
    console.error('[generate-script] Error:', error);
    return NextResponse.json(
      {
        error: '台本生成に失敗しました',
        details: error instanceof Error ? error.message : '不明なエラー'
      },
      { status: 500 }
    );
  }
}