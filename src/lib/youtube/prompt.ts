import type { YoutubeVideoSummary } from './dashboard';

export interface YoutubeScriptPromptInput {
  themeKeyword: string;
  videoType: 'A' | 'B' | 'C' | 'D' | '機能紹介系' | 'ノウハウ系' | '比較検証系' | 'ストーリー系';
  targetPersona?: string;
  analytics: {
    totalViews30d: number;
    avgViewDuration: number;
    subscriberDelta30d: number;
  };
  supportingVideos: YoutubeVideoSummary[];
  additionalNotes?: string;
}

function normalizeVideoType(value: YoutubeScriptPromptInput['videoType']): {
  code: 'A' | 'B' | 'C' | 'D';
  label: '機能紹介系' | 'ノウハウ系' | '比較検証系' | 'ストーリー系';
} {
  const map: Record<string, { code: 'A' | 'B' | 'C' | 'D'; label: '機能紹介系' | 'ノウハウ系' | '比較検証系' | 'ストーリー系' }> = {
    A: { code: 'A', label: '機能紹介系' },
    '機能紹介系': { code: 'A', label: '機能紹介系' },
    B: { code: 'B', label: 'ノウハウ系' },
    'ノウハウ系': { code: 'B', label: 'ノウハウ系' },
    C: { code: 'C', label: '比較検証系' },
    '比較検証系': { code: 'C', label: '比較検証系' },
    D: { code: 'D', label: 'ストーリー系' },
    'ストーリー系': { code: 'D', label: 'ストーリー系' },
  };

  return map[value] ?? map.B;
}

function renderSupportingVideos(videos: YoutubeVideoSummary[]): string {
  if (!videos.length) {
    return '該当する競合動画は見つかりませんでした。';
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

export function buildYoutubeScriptPrompt(input: YoutubeScriptPromptInput): string {
  const videoType = normalizeVideoType(input.videoType);
  const personaText = input.targetPersona ?? 'AI活用に関心のあるビジネスパーソン';
  const analyticsSummary = `直近30日視聴回数: ${Math.round(input.analytics.totalViews30d).toLocaleString()}回 / 平均視聴時間: ${(input.analytics.avgViewDuration / 60).toFixed(1)}分 / 純増登録者: ${Math.round(input.analytics.subscriberDelta30d).toLocaleString()}人`;
  const supporting = renderSupportingVideos(input.supportingVideos);
  const notes = input.additionalNotes ? `\n## 追加メモ\n${input.additionalNotes}` : '';

  return `# YouTube動画台本作成依頼

あなたはYouTube台本作成の専門家です。以下の条件に従って、高品質な動画台本を作成してください。

## 【基本情報】
- チャンネル名：工藤のAI活用チャンネル
- 発信者：工藤（AI活用で人生変化、2年前に600名集客・700万円売上・100時間→5時間効率化の実績）
- 動画テーマ：${input.themeKeyword}
- 動画の長さ：約20分
- ターゲット：${personaText}
- 動画タイプ：${videoType.label}

## 【参考インサイト】
- 自チャンネル実績: ${analyticsSummary}
- 競合の代表的な動画:
${supporting}
${notes}

${getStructureTemplate(videoType.code)}

## 【共通要素】
- オープニングでは工藤の自己紹介と視聴メリットを30秒以内で明示
- エンディングは指定されたLINE誘導キーワードを必ず含めること
- 工藤らしさ（せっかち/コスト意識/実験精神/効率重視/親近感）を自然に織り交ぜる

## 【出力フォーマット】
以下のJSON構造で、追加の説明文やマークダウンは一切書かずに返してください。
{
  "videoTitle": "...",
  "lineKeyword": "...",
  "summary": "...",
  "thumbnailIdeas": ["...", "..."],
  "scriptSections": [
    { "id": "opening", "label": "オープニング", "script": "..." },
    { "id": "section1", "label": "...", "script": "..." }
  ],
  "notes": "制作メモや注意点"
}

- scriptSections はオープニングからエンディングまで、選択した構成パターンに沿うこと。
- 各 script の文量は 250〜400 日本語トークン程度で自然な口語。
- JSON以外の文字列は絶対に出力しない。`;
}

function getStructureTemplate(videoTypeCode: 'A' | 'B' | 'C' | 'D'): string {
  const base = `## 【構成パターン】（動画タイプに応じて選択）

### A. 機能紹介系（新機能・新ツールの解説）
1. オープニング：問題提起
2. PASTERフォーミュラ：機能の必要性を訴求
3. 本編：機能説明→実演→応用例→注意点
4. エンディング：実体験とCTA

### B. ノウハウ系（手法・テクニックの紹介）
1. オープニング：実績・結果を先出し
2. 信頼性構築：失敗体験→成功体験
3. 本編：メソッド解説→段階的実践→結果検証
4. エンディング：再現性とCTA

### C. 比較検証系（ツール・手法の比較）
1. オープニング：疑問・論争の提示
2. 仮説設定：何を比較するか明確化
3. 本編：条件設定→検証実施→結果分析→結論
4. エンディング：推奨事項とCTA

### D. ストーリー系（体験談・事例紹介）
1. オープニング：衝撃的な変化を予告
2. ストーリー展開：過去の状況→転機→変化過程
3. 本編：学びの抽出→再現可能な方法論化
4. エンディング：視聴者への適用とCTA
`;

  const emphasis = {
    A: '採用する構成パターン: 機能紹介系 (A)。',
    B: '採用する構成パターン: ノウハウ系 (B)。',
    C: '採用する構成パターン: 比較検証系 (C)。',
    D: '採用する構成パターン: ストーリー系 (D)。',
  }[videoTypeCode];

  return `${base}\n必ず${emphasis}`;
}

export interface ClaudeYoutubeScriptResponse {
  videoTitle: string;
  lineKeyword: string;
  summary: string;
  thumbnailIdeas: string[];
  scriptSections: Array<{ id: string; label: string; script: string }>;
  notes?: string;
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
  const thumbnailIdeas = Array.isArray(data.thumbnailIdeas)
    ? data.thumbnailIdeas.filter((item): item is string => typeof item === 'string')
    : [];
  const sectionsRaw = Array.isArray(data.scriptSections) ? data.scriptSections : [];
  const scriptSections = sectionsRaw
    .map((section) => {
      if (!section || typeof section !== 'object') return null;
      const value = section as Record<string, unknown>;
      const id = typeof value.id === 'string' ? value.id : undefined;
      const label = typeof value.label === 'string' ? value.label : undefined;
      const script = typeof value.script === 'string' ? value.script : undefined;
      if (!id || !label || !script) return null;
      return { id, label, script };
    })
    .filter((section): section is { id: string; label: string; script: string } => section !== null);

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
