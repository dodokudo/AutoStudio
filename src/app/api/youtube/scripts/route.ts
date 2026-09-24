import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import { resolveProjectId } from '@/lib/bigquery';
import { createNotionClient, getNotionContentDatabaseId, upsertContentPage } from '@/lib/notion';
import { getYoutubeDashboardData } from '@/lib/youtube/dashboard';
import { requestClaudeYoutubeScript } from '@/lib/youtube/claude';
import { buildYoutubeScriptPrompt, parseClaudeYoutubeScriptResponse } from '@/lib/youtube/prompt';
import {
  DEFAULT_YOUTUBE_SCRIPT_TEMPLATE_ID,
  getYoutubeScriptTemplate,
  isYoutubeScriptTemplateId,
  type YoutubeScriptTemplateId,
} from '@/lib/youtube/scriptTemplates';
import {
  createYoutubeBigQueryContext,
  ensureYoutubeTables,
  insertContentScript,
  listContentScripts,
} from '@/lib/youtube/bigquery';

const DATASET_ID = process.env.YOUTUBE_BQ_DATASET_ID ?? 'autostudio_media';

const LEGACY_TEMPLATE_MAP: Record<string, YoutubeScriptTemplateId> = {
  A: 'live-demo',
  '機能紹介系': 'live-demo',
  B: 'roadmap',
  'ノウハウ系': 'roadmap',
  C: 'list-ranking',
  '比較検証系': 'list-ranking',
  D: 'case-study',
  'ストーリー系': 'case-study',
};

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
    templateId?: string;
    videoType?: string;
    durationMinutes?: number;
    targetPersona?: string;
    evidenceNotes?: string;
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
  if (payload.templateId && !isYoutubeScriptTemplateId(payload.templateId)) {
    return NextResponse.json({ error: 'templateId が不正です' }, { status: 400 });
  }

  const requestedTemplate = payload.templateId ?? payload.videoType;
  const templateId = isYoutubeScriptTemplateId(requestedTemplate)
    ? requestedTemplate
    : LEGACY_TEMPLATE_MAP[requestedTemplate ?? ''] ?? DEFAULT_YOUTUBE_SCRIPT_TEMPLATE_ID;
  const template = getYoutubeScriptTemplate(templateId);
  const requestedDuration = Number(payload.durationMinutes ?? template.defaultDurationMinutes);
  const durationMinutes = Number.isFinite(requestedDuration)
    ? Math.min(Math.max(Math.round(requestedDuration), 10), 60)
    : template.defaultDurationMinutes;
  const targetPersona = payload.targetPersona?.trim();
  const evidenceNotes = payload.evidenceNotes?.trim();
  const additionalNotes = payload.notes?.trim();

  try {
    const [dashboard, projectId] = await Promise.all([getYoutubeDashboardData(), Promise.resolve(resolveProjectId())]);

    const theme = dashboard.themes.find((item) => item.keyword === themeKeyword);
    const supportingVideos = theme?.representativeVideos.length
      ? theme.representativeVideos
      : dashboard.topVideos.slice(0, 5);

    const prompt = buildYoutubeScriptPrompt({
      themeKeyword,
      templateId,
      durationMinutes,
      targetPersona,
      evidenceNotes,
      analytics: {
        totalViews30d: dashboard.overview.totalViews30d,
        avgViewDuration: dashboard.overview.avgViewDuration,
        subscriberDelta30d: dashboard.overview.subscriberDelta30d,
      },
      supportingVideos,
      additionalNotes,
    });

    console.log('[youtube/scripts] Requesting Claude script generation...');
    const claudeRaw = await requestClaudeYoutubeScript(prompt);
    console.log('[youtube/scripts] Claude response received, parsing...');
    const parsedScript = parseClaudeYoutubeScriptResponse(claudeRaw);
    const sectionsById = new Map(parsedScript.scriptSections.map((section) => [section.id, section]));
    const missingSectionIds = template.sections
      .map((section) => section.id)
      .filter((sectionId) => !sectionsById.has(sectionId));
    if (missingSectionIds.length) {
      throw new Error(`生成台本に必須セクションがありません: ${missingSectionIds.join(', ')}`);
    }
    const claudeScript = {
      ...parsedScript,
      scriptSections: template.sections.map((section) => ({
        ...sectionsById.get(section.id)!,
        label: section.label,
      })),
    };

    const contentId = `yt-script-${randomUUID()}`;
    const now = new Date().toISOString();

    const scriptBodyLines: string[] = [];
    scriptBodyLines.push(`【動画タイトル案】\n${claudeScript.videoTitle}`);
    scriptBodyLines.push('');
    for (const section of claudeScript.scriptSections) {
      const durationLabel = section.targetMinutes ? ` / ${section.targetMinutes}分` : '';
      scriptBodyLines.push(`【${section.label}${durationLabel}】`);
      if (section.purpose) {
        scriptBodyLines.push(`目的: ${section.purpose}`);
      }
      if (section.visualDirection) {
        scriptBodyLines.push(`画面・演出: ${section.visualDirection}`);
      }
      if (section.keyPoints.length) {
        scriptBodyLines.push(`要点:\n${section.keyPoints.map((point) => `- ${point}`).join('\n')}`);
      }
      if (section.evidenceNeeded.length) {
        scriptBodyLines.push(`必要素材:\n${section.evidenceNeeded.map((item) => `- ${item}`).join('\n')}`);
      }
      scriptBodyLines.push('');
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

    console.log('[youtube/scripts] Creating Notion page...');
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
      templateName: template.label,
      sourceUrls: supportingVideos
        .map((video) => (video.videoId ? `https://www.youtube.com/watch?v=${video.videoId}` : undefined))
        .filter((url): url is string => Boolean(url)),
      body: scriptBodyLines.join('\n'),
    });
    console.log('[youtube/scripts] Notion page created:', notionPageId);

    console.log('[youtube/scripts] Saving to BigQuery...');
    const context = createYoutubeBigQueryContext(projectId, DATASET_ID);
    await ensureYoutubeTables(context);
    await insertContentScript(context, {
      media: 'youtube',
      contentId,
      themeKeyword,
      targetPersona: targetPersona ? [targetPersona] : undefined,
      videoType: templateId,
      status: 'draft',
      notionPageId,
      generatedAt: now,
      updatedAt: now,
      author: 'Claude',
      payloadJson: JSON.stringify(claudeScript),
      summary: claudeScript.summary,
      title: claudeScript.videoTitle,
    });
    console.log('[youtube/scripts] Successfully completed script generation');

    return NextResponse.json({
      contentId,
      videoTitle: claudeScript.videoTitle,
      templateId,
      templateLabel: template.label,
      durationMinutes,
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
