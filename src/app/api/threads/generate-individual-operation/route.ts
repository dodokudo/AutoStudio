import { NextRequest, NextResponse } from 'next/server';
import { resolveProjectId, createBigQueryClient } from '@/lib/bigquery';
import { upsertPlan } from '@/lib/bigqueryPlans';
import { THREADS_OPERATION_PROMPT } from '@/lib/threadsOperationPrompt';
import type { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';

const CLAUDE_API_URL = process.env.CLAUDE_API_URL?.trim() ?? 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY?.trim();
const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

// Threads運用テーマリスト（generate-operationから抜粋）
const THREADS_THEMES = [
  'Threadsでバズる投稿の書き方、完全公開します',
  'Threadsの長文投稿で10万インプレッションを超える方法',
  'Threadsのコメント欄活用で滞在時間を3倍にする技術',
  'Threadsのフックの書き方、データで証明された最強パターン',
  'Threadsのフォロワーが増えない人の共通点5つ',
  'Threads運用、1ヶ月で1600名増やした完全ロードマップ',
  'Threadsのエンゲージメント、投稿後30分が勝負な理由',
  'Threadsのいいね率、0.5%超えたら勝ち投稿の法則',
  'Threadsアルゴリズムの真実、活発さが全てだった',
  'Threadsのおすすめ欄、載る投稿と載らない投稿の違い',
  'Threadsの投稿時間、9割の人が間違えている最適タイミング',
  'Threadsの朝6-9時投稿、勝率43%の黄金時間帯',
  'Threadsプロフィールの自己紹介文、3行で完結させる書き方',
  'Threadsの質問投げかけ型フック、エンゲージメントを高める書き方',
  'Threadsのよくある間違い系投稿の作り方',
  'Threadsの番号付きリスト、平均インプレッションを高める使い方',
  'Threadsの勝ち投稿分析、10,000imp以上を出す7つの法則',
  'ThreadsのCTA設計、フォロー促進の書き方',
  'Threadsのいいね周り、時間の無駄すぎる理由',
  'Threadsのフォロー周り、やめたらフォロワー増えた話',
  'Threadsのいいね数、閲覧数と全く別の指標です',
  'Threadsの冒頭1行目、適当に書いてる人終わってます',
  'Threadsのアカウント崩壊、相互フォローが原因の9割',
  'Threadsのシャドウバン、いいね周りが引き金になる',
];

// フックパターン
const HOOK_PATTERNS = [
  {
    type: 'denial',
    weight: 35,
    templates: [
      'まだ{theme}してる人、12月で終了です',
      '{theme}してる人、完全に時代遅れです。全部ズレてます',
      '{theme}、まだやってる人マジで終わってます',
      'やばいです。{theme}してる人、アカウント壊れます',
    ],
  },
  {
    type: 'warning',
    weight: 20,
    templates: [
      '{theme}、9割の人が間違ってます',
      '{theme}、知らない人多すぎて損してます',
      '{theme}、やってない人マジでもったいないです',
    ],
  },
  {
    type: 'number',
    weight: 15,
    templates: [
      '{theme}、2ヶ月でフォロワー2500名増えました',
      '{theme}、167万インプレッション達成した方法',
      '{theme}、832件のデータ分析で判明しました',
    ],
  },
  {
    type: 'authority',
    weight: 10,
    templates: [
      'Threadsの公式発表によると、{theme}',
      'Meta最新アップデート、{theme}',
      'Threads運用者必見、{theme}が変わります',
    ],
  },
  {
    type: 'emotion',
    weight: 10,
    templates: [
      '私が絶対やらない{theme}',
      '正直、{theme}は大嫌いです',
      '{theme}、イライラする人多すぎ',
    ],
  },
  {
    type: 'title',
    weight: 10,
    templates: [
      '【緊急】{theme}',
      '【知らないとヤバい】{theme}',
      '【完全保存版】{theme}',
    ],
  },
];

function selectRandomTheme(): string {
  return THREADS_THEMES[Math.floor(Math.random() * THREADS_THEMES.length)];
}

function selectHookPattern(): { type: string; template: string } {
  const totalWeight = HOOK_PATTERNS.reduce((sum, p) => sum + p.weight, 0);
  let random = Math.random() * totalWeight;

  for (const pattern of HOOK_PATTERNS) {
    random -= pattern.weight;
    if (random <= 0) {
      const template = pattern.templates[Math.floor(Math.random() * pattern.templates.length)];
      return { type: pattern.type, template };
    }
  }

  const fallback = HOOK_PATTERNS[0];
  return { type: fallback.type, template: fallback.templates[0] };
}

interface MonguchiPost {
  content: string;
  impressions: number;
  followers_delta: number;
  tier: string;
}

function toPlainString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

async function runQuery<T = Record<string, unknown>>(
  client: BigQuery,
  sql: string,
): Promise<T[]> {
  const [rows] = await client.query({ query: sql });
  return rows as T[];
}

async function fetchMonguchiPosts(client: BigQuery, projectId: string): Promise<MonguchiPost[]> {
  const sql = `
WITH max_post AS (
  SELECT MAX(DATE(post_date)) AS latest_date
  FROM \`${projectId}.${DATASET}.competitor_posts_raw\`
),
daily AS (
  SELECT
    username,
    date AS daily_date,
    followers,
    CASE
      WHEN LAG(followers) OVER (PARTITION BY username ORDER BY date) IS NULL THEN 0
      WHEN LAG(followers) OVER (PARTITION BY username ORDER BY date) = 0 THEN 0
      ELSE followers - LAG(followers) OVER (PARTITION BY username ORDER BY date)
    END AS followers_delta
  FROM \`${projectId}.${DATASET}.competitor_account_daily\`
  WHERE followers > 0
),
joined AS (
  SELECT
    p.content,
    p.impressions,
    COALESCE(d.followers_delta, 0) AS followers_delta,
    CASE
      WHEN p.impressions >= 30000 AND COALESCE(d.followers_delta,0) >= 100 THEN "tier_S"
      WHEN (p.impressions >= 20000 AND COALESCE(d.followers_delta,0) >= 50)
           OR (p.impressions < 20000 AND COALESCE(d.followers_delta,0) >= 80) THEN "tier_A"
      WHEN p.impressions >= 20000 AND COALESCE(d.followers_delta,0) >= 30 THEN "tier_B"
      ELSE "tier_C"
    END AS tier
  FROM \`${projectId}.${DATASET}.competitor_posts_raw\` p
  CROSS JOIN max_post m
  LEFT JOIN daily d ON p.username = d.username AND DATE(p.post_date) = d.daily_date
  WHERE DATE(p.post_date) BETWEEN DATE_SUB(m.latest_date, INTERVAL 30 DAY) AND m.latest_date
    AND p.username = 'mon_guchi'
    AND LENGTH(p.content) > 500
)
SELECT *
FROM joined
WHERE tier IN ('tier_S', 'tier_A')
ORDER BY RAND()
LIMIT 10
  `;

  type Row = {
    content?: string;
    impressions?: number;
    followers_delta?: number;
    tier?: string;
  };

  const rows = await runQuery<Row>(client, sql);
  return rows.map((row) => ({
    content: row.content ?? '',
    impressions: Number(row.impressions ?? 0),
    followers_delta: Number(row.followers_delta ?? 0),
    tier: row.tier ?? 'tier_C',
  }));
}

export async function POST(request: NextRequest) {
  try {
    if (!CLAUDE_API_KEY) {
      throw new Error('CLAUDE_API_KEY is not configured');
    }

    // リクエストからテーマを取得（任意）
    const body = await request.json().catch(() => ({}));
    const customTheme = typeof body?.theme === 'string' ? body.theme.trim() : '';

    // テーマとフックを決定
    let theme: string;
    let finalTheme: string;

    if (customTheme) {
      // カスタムテーマが指定された場合はそれを使用
      theme = customTheme;
      finalTheme = customTheme;
    } else {
      // テーマとフックをランダム選択
      theme = selectRandomTheme();
      const hook = selectHookPattern();
      finalTheme = hook.template.replace('{theme}', theme);
    }

    // 門口さんの投稿を取得
    const client = createBigQueryClient(PROJECT_ID);
    const monguchiPosts = await fetchMonguchiPosts(client, PROJECT_ID);

    const monguchiExamples = monguchiPosts.map((post, idx) => {
      return `### 参考例${idx + 1}（${post.impressions.toLocaleString()}imp / フォロワー増${post.followers_delta}名 / ${post.tier}）\n${post.content}\n`;
    }).join('\n');

    const prompt = `${THREADS_OPERATION_PROMPT}

# 門口さんの実際の投稿例（直近30日間の高パフォーマンス投稿）
以下の投稿の構成・文体・リズム・表現を完全にトレースしてThreads運用系の投稿を作成してください。
特に以下の要素を真似る:
- フックの作り方
- 体験談の入れ方
- 数値の見せ方
- 箇条書きの使い方
- 改行のリズム
- 関西弁のトーン
- Before→Afterの訴求方法

${monguchiExamples}

# 今回の生成依頼
## テーマ
${theme}

## 出力形式
以下のJSON形式で返してください（markdown不要）:
{
  "mainPost": "メイン投稿150-200文字",
  "comment1": "コメント1: 必ず400文字以上、最大500文字",
  "comment2": "コメント2: 必ず400文字以上、最大500文字"
}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    const response = await fetch(CLAUDE_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        temperature: 0.9,
        system: 'You are an expert Japanese social media planner who outputs strict JSON only. Never use markdown code blocks or explanations. Respect all constraints from the user prompt. IMPORTANT: Use \\n\\n for line breaks in text content to improve readability. CRITICAL: Never use emojis in any generated content.',
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Claude API error: ${response.status} ${response.statusText} ${text}`);
    }

    const data = await response.json();
    const textContent = data?.content?.[0]?.text;

    if (!textContent || typeof textContent !== 'string') {
      throw new Error('Unexpected Claude response format');
    }

    // Remove markdown code blocks
    let cleanContent = textContent;
    const fenceToken = '```';
    cleanContent = cleanContent.split(fenceToken + 'json').join('');
    cleanContent = cleanContent.split(fenceToken).join('');
    cleanContent = cleanContent.trim();

    const parsed = JSON.parse(cleanContent);

    const planId = `threads-op-individual-${Date.now()}`;
    const scheduledTime = '07:00';

    // BigQueryに保存
    await upsertPlan({
      plan_id: planId,
      generation_date: new Date().toISOString().slice(0, 10),
      scheduled_time: scheduledTime,
      template_id: 'threads-operation',
      theme: finalTheme,
      status: 'draft',
      main_text: parsed.mainPost,
      comments: JSON.stringify([
        { order: 1, text: parsed.comment1 },
        { order: 2, text: parsed.comment2 },
      ]),
    });

    return NextResponse.json({
      planId,
      result: {
        planId,
        templateId: 'threads-operation',
        theme: finalTheme,
        scheduledTime,
        mainPost: parsed.mainPost,
        comments: [parsed.comment1, parsed.comment2],
      },
    }, { status: 200 });
  } catch (error) {
    console.error('[generate-individual-operation] Error:', error);
    const errorMessage = error instanceof Error ? error.message : '不明なエラー';

    return NextResponse.json({
      error: '投稿生成中にエラーが発生しました',
      details: errorMessage,
    }, { status: 500 });
  }
}
