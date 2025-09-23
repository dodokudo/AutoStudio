import { ThreadsPromptPayload } from '@/types/prompt';

const CLAUDE_API_URL = process.env.CLAUDE_API_URL ?? 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const CLAUDE_MODEL = process.env.CLAUDE_MODEL ?? 'claude-3-5-sonnet-20240620';

interface ClaudePlanResponse {
  posts: Array<{
    planId?: string;
    templateId: string;
    theme: string;
    scheduledTime?: string;
    main: string;
    comments?: string[];
  }>;
}

function buildPrompt(payload: ThreadsPromptPayload): string {
  const summary = `アカウント7日平均 フォロワー: ${payload.accountSummary.averageFollowers}, プロフ閲覧: ${payload.accountSummary.averageProfileViews}`;
  const trends = payload.trendingTopics
    .map((topic, index) => `${index + 1}. ${topic.themeTag} (Δフォロワー ${Math.round(topic.avgFollowersDelta)}, 閲覧 ${Math.round(topic.avgViews)})`)
    .join('\n');
  const competitors = payload.competitorHighlights
    .map((highlight, index) => `${index + 1}. ${highlight.accountName}: ${highlight.contentSnippet}`)
    .join('\n');

  return `あなたはSNSマーケティングプランナーです。以下のインサイトを元にThreads投稿案を作成してください。出力はJSONのみで返してください。

[アカウントサマリ]\n${summary}

[競合ハイライト]\n${competitors}

[トレンドテーマ]\n${trends}

出力フォーマット例:
{ "posts": [ { "planId": "plan-01", "templateId": "hook_negate_v3", "theme": "AI効率化", "scheduledTime": "07:00", "main": "本文", "comments": ["コメント1", "コメント2"] } ] }

条件:
- posts は ${payload.meta.targetPostCount} 件。
- main は日本語200〜400字程度で具体的なHowToとCTAを入れる。
- comments は最大2件。詳細やCTA誘導を入れる。
- theme はプレーンテキスト。
- scheduledTime はHH:mm。指定が難しければ空文字でよい。
- templateId は既存テンプレート名（推測可）。不明な場合は "auto-generated"。
`;
}

export async function generateClaudePlans(payload: ThreadsPromptPayload): Promise<ClaudePlanResponse> {
  if (!CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY is not configured');
  }

  const prompt = buildPrompt(payload);

  const response = await fetch(CLAUDE_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 2000,
      temperature: 0.7,
      system: 'You are an expert Japanese social media planner who outputs strict JSON.',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Claude API error: ${response.status} ${response.statusText} ${text}`);
  }

  const data = await response.json();
  const textContent = data?.content?.[0]?.text;
  if (!textContent || typeof textContent !== 'string') {
    throw new Error('Unexpected Claude response format');
  }

  try {
    return JSON.parse(textContent) as ClaudePlanResponse;
  } catch (error) {
    throw new Error(`Failed to parse Claude JSON response: ${(error as Error).message}`);
  }
}
