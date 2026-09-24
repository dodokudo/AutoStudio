import type { YoutubeVideoSummary } from './dashboard';
import {
  getSectionTargetMinutes,
  getYoutubeScriptTemplate,
  type YoutubeScriptTemplateId,
} from './scriptTemplates';

export interface YoutubeScriptPromptInput {
  themeKeyword: string;
  templateId: YoutubeScriptTemplateId;
  durationMinutes: number;
  targetPersona?: string;
  evidenceNotes?: string;
  analytics: {
    totalViews30d: number;
    avgViewDuration: number;
    subscriberDelta30d: number;
  };
  supportingVideos: YoutubeVideoSummary[];
  additionalNotes?: string;
}

function renderSupportingVideos(videos: YoutubeVideoSummary[]): string {
  if (!videos.length) {
    return '該当する参考動画はありません。タイトルや数値を推測で補わないでください。';
  }

  return videos
    .slice(0, 5)
    .map((video, index) => {
      const parts: string[] = [];
      parts.push(`${index + 1}. ${video.channelTitle ?? video.channelId}「${video.title}」`);
      if (video.viewCount !== undefined) {
        parts.push(`再生${video.viewCount.toLocaleString()}回`);
      }
      if (video.viewVelocity !== undefined) {
        parts.push(`伸び速度/日 ${Math.round(video.viewVelocity).toLocaleString()}`);
      }
      if (video.engagementRate !== undefined) {
        parts.push(`ER ${(video.engagementRate * 100).toFixed(1)}%`);
      }
      return parts.join(' / ');
    })
    .join('\n');
}

function renderTemplateStructure(templateId: YoutubeScriptTemplateId, durationMinutes: number): string {
  const template = getYoutubeScriptTemplate(templateId);

  return template.sections
    .map((section, index) => {
      const targetMinutes = getSectionTargetMinutes(template, durationMinutes, section.weight);
      const requirements = section.requirements.map((requirement) => `   - ${requirement}`).join('\n');
      return `${index + 1}. ${section.label} [id: ${section.id}]（目安 ${targetMinutes}分）\n   目的: ${section.purpose}\n${requirements}`;
    })
    .join('\n');
}

export function buildYoutubeScriptPrompt(input: YoutubeScriptPromptInput): string {
  const template = getYoutubeScriptTemplate(input.templateId);
  const personaText = input.targetPersona ?? 'Threads運用をこれから伸ばしたい個人事業主・経営者';
  const analyticsSummary = `直近30日視聴回数: ${Math.round(input.analytics.totalViews30d).toLocaleString()}回 / 平均視聴時間: ${(input.analytics.avgViewDuration / 60).toFixed(1)}分 / 純増登録者: ${Math.round(input.analytics.subscriberDelta30d).toLocaleString()}人`;
  const supporting = renderSupportingVideos(input.supportingVideos);
  const evidence = input.evidenceNotes?.trim() || '提供なし。実績・数値・固有の体験は創作せず、必要箇所を「[要確認: 必要な証拠]」と明示すること。';
  const notes = input.additionalNotes?.trim() || '特になし';
  const structure = renderTemplateStructure(input.templateId, input.durationMinutes);

  return `# YouTube動画台本作成依頼

あなたは日本語YouTube動画の構成作家です。競合動画の表面表現をコピーせず、勝ちパターンの構造を使って、撮影できるレベルの詳細な台本を作成してください。

## 基本情報
- チャンネル名：工藤のAI活用チャンネル
- 発信者：工藤
- 動画テーマ：${input.themeKeyword}
- 目標尺：約${input.durationMinutes}分
- ターゲット：${personaText}
- 採用テンプレート：${template.label}
- この型が向く企画：${template.bestFor}
- 型の狙い：${template.description}

## 利用できる事実・証拠
${evidence}

## 参考インサイト
- 自チャンネル実績: ${analyticsSummary}
- 参考動画（内容や因果関係はタイトルと数値だけから断定しない）:
${supporting}

## 追加指示
${notes}

## 必須の章構造
次の章を同じID・順序で必ず出力してください。各章の目的と必須要素を満たし、章同士で同じ話を繰り返さないでください。

${structure}

## 台本作成ルール
- 冒頭30秒以内に「誰の、どんな悩みを、どこまで解決する動画か」を明示する。
- 抽象論で終わらせず、判断基準、具体例、画面または図解の指示を入れる。
- script は箇条書きの構成案ではなく、工藤がそのまま話せる自然な口語の完成原稿にする。
- 工藤らしさ（せっかち、コスト意識、実験精神、効率重視、親近感）は、決め台詞ではなく判断や具体例に自然に反映する。
- 提供されていない実績、売上、人数、期間、コメント、体験談は絶対に創作しない。必要なら evidenceNeeded に不足素材を書く。
- 参考動画のタイトル、言い回し、固有事例を転載しない。構造と視聴者心理だけを参考にする。
- targetMinutes の合計が約${input.durationMinutes}分になるようにし、章ごとの密度を調整する。
- visualDirection には、収録時に必要な画面、テロップ、図解、証拠映像を具体的に書く。
- エンディングでは本編の内容と自然につながるLINE特典を提案し、lineKeyword を案内する。

## 出力フォーマット
以下のJSON構造で、追加説明やMarkdownを一切書かずに返してください。
{
  "videoTitle": "検索意図と視聴メリットが伝わるタイトル",
  "lineKeyword": "短い日本語キーワード",
  "summary": "動画の狙いと内容を120字以内で要約",
  "thumbnailIdeas": ["文字案｜画面構成案", "文字案｜画面構成案", "文字案｜画面構成案"],
  "scriptSections": [
    {
      "id": "指定された章ID",
      "label": "指定された章名",
      "purpose": "この章で視聴者に起こす変化",
      "targetMinutes": 1.5,
      "visualDirection": "画面・テロップ・図解・証拠素材の指示",
      "keyPoints": ["要点1", "要点2"],
      "evidenceNeeded": ["撮影前に用意する実績画面や数値。不要なら空配列"],
      "script": "そのまま話せる完成原稿"
    }
  ],
  "notes": "撮影順、必要素材、要確認事項をまとめた制作メモ"
}

- scriptSections は上記「必須の章構造」と同じ件数・ID・順序にする。
- JSON以外の文字列は絶対に出力しない。`;
}

export interface ClaudeYoutubeScriptSection {
  id: string;
  label: string;
  purpose: string | undefined;
  targetMinutes: number | undefined;
  visualDirection: string | undefined;
  keyPoints: string[];
  evidenceNeeded: string[];
  script: string;
}

export interface ClaudeYoutubeScriptResponse {
  videoTitle: string;
  lineKeyword: string;
  summary: string;
  thumbnailIdeas: string[];
  scriptSections: ClaudeYoutubeScriptSection[];
  notes?: string;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function parseClaudeYoutubeScriptResponse(content: unknown): ClaudeYoutubeScriptResponse {
  if (!content || typeof content !== 'object') {
    throw new Error('Claude応答が不正です');
  }

  const data = content as Record<string, unknown>;
  const videoTitle = typeof data.videoTitle === 'string' ? data.videoTitle : undefined;
  const lineKeyword = typeof data.lineKeyword === 'string' ? data.lineKeyword : undefined;
  const summary = typeof data.summary === 'string' ? data.summary : undefined;
  const notes = typeof data.notes === 'string' ? data.notes : undefined;
  const thumbnailIdeas = stringArray(data.thumbnailIdeas);
  const sectionsRaw = Array.isArray(data.scriptSections) ? data.scriptSections : [];
  const scriptSections = sectionsRaw
    .map((section) => {
      if (!section || typeof section !== 'object') return null;
      const value = section as Record<string, unknown>;
      const id = typeof value.id === 'string' ? value.id : undefined;
      const label = typeof value.label === 'string' ? value.label : undefined;
      const script = typeof value.script === 'string' ? value.script : undefined;
      if (!id || !label || !script) return null;

      return {
        id,
        label,
        script,
        purpose: typeof value.purpose === 'string' ? value.purpose : undefined,
        targetMinutes: typeof value.targetMinutes === 'number' ? value.targetMinutes : undefined,
        visualDirection: typeof value.visualDirection === 'string' ? value.visualDirection : undefined,
        keyPoints: stringArray(value.keyPoints),
        evidenceNeeded: stringArray(value.evidenceNeeded),
      };
    })
    .filter((section): section is ClaudeYoutubeScriptSection => section !== null);

  if (!videoTitle || !lineKeyword || !summary || scriptSections.length === 0) {
    throw new Error('Claude応答の必須フィールドが不足しています');
  }

  return {
    videoTitle,
    lineKeyword,
    summary,
    thumbnailIdeas,
    scriptSections,
    notes,
  };
}
