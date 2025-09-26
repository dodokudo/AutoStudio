import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import { resolveProjectId } from '@/lib/bigquery';
import { createNotionClient, getNotionContentDatabaseId, upsertContentPage } from '@/lib/notion';
import { getYoutubeDashboardData } from '@/lib/youtube/dashboard';
import { requestClaudeYoutubeScript } from '@/lib/youtube/claude';
import { buildYoutubeScriptPrompt, parseClaudeYoutubeScriptResponse } from '@/lib/youtube/prompt';
import {
  createYoutubeBigQueryContext,
  ensureYoutubeTables,
  insertContentScript,
  listContentScripts,
} from '@/lib/youtube/bigquery';

const DATASET_ID = process.env.YOUTUBE_BQ_DATASET_ID ?? 'autostudio_media';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(Math.max(Number(limitParam) || 20, 1), 100) : 20;

  try {
    const projectId = resolveProjectId();
    const context = createYoutubeBigQueryContext(projectId, DATASET_ID);
    await ensureYoutubeTables(context);
    const scripts = await listContentScripts(context, { limit });

    return NextResponse.json({ scripts });
  } catch (error) {
    console.error('[youtube/scripts][GET] error', error);
    return NextResponse.json({ error: 'スクリプト一覧の取得に失敗しました' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let payload: {
    themeKeyword?: string;
    videoType?: string;
    targetPersona?: string;
    notes?: string;
  };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSONボディを解析できませんでした' }, { status: 400 });
  }

  const themeKeyword = payload.themeKeyword?.trim();
  if (!themeKeyword) {
    return NextResponse.json({ error: 'themeKeyword は必須です' }, { status: 400 });
  }

  const videoType = (payload.videoType ?? 'B') as
    | 'A'
    | 'B'
    | 'C'
    | 'D'
    | '機能紹介系'
    | 'ノウハウ系'
    | '比較検証系'
    | 'ストーリー系';
  const targetPersona = payload.targetPersona?.trim();
  const additionalNotes = payload.notes?.trim();

  try {
    const [dashboard, projectId] = await Promise.all([getYoutubeDashboardData(), Promise.resolve(resolveProjectId())]);

    const theme = dashboard.themes.find((item) => item.keyword === themeKeyword);
    const supportingVideos = theme?.representativeVideos.length
      ? theme.representativeVideos
      : dashboard.topVideos.slice(0, 5);

    const prompt = buildYoutubeScriptPrompt({
      themeKeyword,
      videoType,
      targetPersona,
      analytics: {
        totalViews30d: dashboard.overview.totalViews30d,
        avgViewDuration: dashboard.overview.avgViewDuration,
        subscriberDelta30d: dashboard.overview.subscriberDelta30d,
      },
      supportingVideos,
      additionalNotes,
    });

    const claudeRaw = await requestClaudeYoutubeScript(prompt);
    const claudeScript = parseClaudeYoutubeScriptResponse(claudeRaw);

    const contentId = `yt-script-${randomUUID()}`;
    const now = new Date().toISOString();

    const scriptBodyLines: string[] = [];
    scriptBodyLines.push(`【動画タイトル案】\n${claudeScript.videoTitle}`);
    scriptBodyLines.push('');
    for (const section of claudeScript.scriptSections) {
      scriptBodyLines.push(`【${section.label}】`);
      scriptBodyLines.push(section.script);
      scriptBodyLines.push('');
    }
    if (claudeScript.thumbnailIdeas.length) {
      scriptBodyLines.push('【サムネイル案】');
      scriptBodyLines.push(claudeScript.thumbnailIdeas.map((idea, index) => `${index + 1}. ${idea}`).join('\n'));
      scriptBodyLines.push('');
    }
    scriptBodyLines.push(`【LINE誘導キーワード】\n${claudeScript.lineKeyword}`);
    if (claudeScript.notes) {
      scriptBodyLines.push('');
      scriptBodyLines.push(`【制作メモ】\n${claudeScript.notes}`);
    }

    const notionClient = createNotionClient();
    const notionDatabaseId = getNotionContentDatabaseId();
    const notionPageId = await upsertContentPage(notionClient, notionDatabaseId, {
      autoStudioId: contentId,
      title: claudeScript.videoTitle,
      media: 'YouTube',
      contentType: 'Script Draft',
      status: 'Draft',
      targetPersona: targetPersona ? [targetPersona] : undefined,
      themeKeyword,
      generatedAt: now,
      templateName: videoType,
      sourceUrls: supportingVideos
        .map((video) => (video.videoId ? `https://www.youtube.com/watch?v=${video.videoId}` : undefined))
        .filter((url): url is string => Boolean(url)),
      body: scriptBodyLines.join('\n'),
    });

    const context = createYoutubeBigQueryContext(projectId, DATASET_ID);
    await ensureYoutubeTables(context);
    await insertContentScript(context, {
      media: 'youtube',
      contentId,
      themeKeyword,
      targetPersona: targetPersona ? [targetPersona] : undefined,
      videoType,
      status: 'draft',
      notionPageId,
      generatedAt: now,
      updatedAt: now,
      author: 'Claude',
      payloadJson: JSON.stringify(claudeScript),
      summary: claudeScript.summary,
      title: claudeScript.videoTitle,
    });

    return NextResponse.json({
      contentId,
      videoTitle: claudeScript.videoTitle,
      notionPageId,
      lineKeyword: claudeScript.lineKeyword,
      thumbnailIdeas: claudeScript.thumbnailIdeas,
      summary: claudeScript.summary,
      scriptSections: claudeScript.scriptSections,
    });
  } catch (error) {
    console.error('[youtube/scripts][POST] error', error);
    return NextResponse.json({ error: '台本生成に失敗しました' }, { status: 500 });
  }
}
