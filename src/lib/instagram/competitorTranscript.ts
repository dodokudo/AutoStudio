export interface CompetitorTranscriptSegmentInput {
  start: number;
  end: number;
  text: string;
}

export interface CompetitorTranscriptChapter {
  start: number;
  end: number;
  title: string;
}

const SENTENCE_BREAK = /(?<=[。！？!?])/u;

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function clip(value: string, maxLength: number): string {
  const text = compact(value).replace(/[。！？!?]+$/u, '');
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function meaningfulSentence(value: string): string {
  const sentences = compact(value).split(SENTENCE_BREAK).map(compact).filter(Boolean);
  return sentences.find((sentence) => (
    sentence.length >= 8
    && !/^(?:はい[、,\s]*)?(?:どうも|こんにちは|こんばんは|おはようございます)/u.test(sentence)
  )) ?? sentences[0] ?? '';
}

export function deriveCompetitorReelTitle(
  segments: CompetitorTranscriptSegmentInput[],
  fallback = '',
): string {
  const opening = segments.slice(0, 2).map((segment) => segment.text).join(' ');
  const tools = ['ChatGPT', 'Gemini', 'Claude'].filter((tool) => opening.includes(tool));
  if (tools.length >= 2 && /おすすめ|オススメ/u.test(opening)) {
    return `${tools.join('・')}、おすすめAIを比較`;
  }
  if (opening.includes('Claude') && /論外|損/u.test(opening)) {
    return 'Claudeは論外。AI副業初心者が使うべきAI';
  }
  const title = meaningfulSentence(opening) || meaningfulSentence(fallback);
  return clip(title || 'タイトル未生成', 52);
}

function inferChapterTitle(text: string, index: number): string {
  const rules: Array<[RegExp, string]> = [
    [/結論|答え|正解/u, '結論'],
    [/理由|なぜ|原因/u, '理由と背景'],
    [/手順|ステップ|まず|次に/u, '具体的な手順'],
    [/例えば|具体例|実際/u, '具体例'],
    [/注意|やってはいけない|NG/u, '注意点'],
    [/まとめ|最後に|プロフィール|フォロー|コメント/u, 'まとめ・CTA'],
  ];
  for (const [pattern, title] of rules) {
    if (pattern.test(text)) return title;
  }
  const extracted = clip(meaningfulSentence(text), 34);
  if (!extracted) return index === 0 ? 'オープニング' : `パート${index + 1}`;
  return index === 0 ? `冒頭：${extracted}` : extracted;
}

export function buildCompetitorReelChapters(
  segments: CompetitorTranscriptSegmentInput[],
): CompetitorTranscriptChapter[] {
  if (!segments.length) return [];
  const duration = Math.max(...segments.map((segment) => segment.end));
  const starts = [0];
  let lastStart = 0;
  const targetLength = duration <= 45 ? 16 : duration <= 120 ? 24 : 40;
  const minimumLength = Math.max(8, targetLength * 0.55);
  const transition = /(?:まず|次に|続いて|ここから|では|理由|例えば|ポイント|注意|最後に|まとめ)/u;

  for (const segment of segments) {
    const elapsed = segment.start - lastStart;
    if (elapsed < minimumLength) continue;
    if (elapsed >= targetLength || transition.test(segment.text)) {
      starts.push(segment.start);
      lastStart = segment.start;
    }
  }
  if (starts.length > 1 && duration - starts.at(-1)! < 7) starts.pop();

  return starts.map((start, index) => {
    const end = starts[index + 1] ?? duration;
    const context = segments
      .filter((segment) => segment.end > start && segment.start < end)
      .map((segment) => segment.text)
      .join(' ');
    return { start, end, title: inferChapterTitle(context, index) };
  });
}
