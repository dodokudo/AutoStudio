import { NextRequest, NextResponse } from 'next/server';
import { resolveProjectId, createBigQueryClient } from '@/lib/bigquery';
import { THREADS_OPERATION_PROMPT } from '@/lib/threadsOperationPrompt';
import type { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';

const CLAUDE_API_URL = process.env.CLAUDE_API_URL?.trim() ?? 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY?.trim();
const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

interface MonguchiPost {
  content: string;
  impressions: number;
  followers_delta: number;
  tier: string;
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

function buildPrompt({
  hook,
  theme,
  monguchiExamples,
}: {
  hook: string | null;
  theme: string | null;
  monguchiExamples: string;
}) {
  const hookBlock = hook
    ? `## フック\n以下のフック（冒頭の一文）を絶対に変更せずにそのまま使用してください: ${hook}\n\n`
    : '';
  const themeBlock = theme
    ? `## テーマ\n${theme}\n\n`
    : '## テーマ\n（未指定。Threads運用に関する有益なテーマを自分で設定してください。）\n\n';

  return `${THREADS_OPERATION_PROMPT}

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
${hookBlock}${themeBlock}## 出力形式
以下のJSON形式で返してください（markdown不要）:
{
  "mainPost": "メイン投稿150-200文字",
  "comment1": "コメント1: 必ず400文字以上、最大500文字",
  "comment2": "コメント2: 必ず400文字以上、最大500文字"
}`;
}

export async function POST(request: NextRequest) {
  try {
    if (!CLAUDE_API_KEY) {
      throw new Error('CLAUDE_API_KEY is not configured');
    }

    const body = await request.json().catch(() => ({}));
    const rawHook = typeof body?.hook === 'string' ? body.hook : '';
    const hook = rawHook.trim().length > 0 ? rawHook : null;
    const theme = typeof body?.theme === 'string' ? body.theme.trim() || null : null;

    const client = createBigQueryClient(PROJECT_ID);
    const monguchiPosts = await fetchMonguchiPosts(client, PROJECT_ID);

    const monguchiExamples = monguchiPosts.map((post, idx) => {
      return `### 参考例${idx + 1}（${post.impressions.toLocaleString()}imp / フォロワー増${post.followers_delta}名 / ${post.tier}）\n${post.content}\n`;
    }).join('\n');

    const prompt = buildPrompt({ hook, theme, monguchiExamples });

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

    let cleanContent = textContent;
    const fenceToken = '```';
    cleanContent = cleanContent.split(fenceToken + 'json').join('');
    cleanContent = cleanContent.split(fenceToken).join('');
    cleanContent = cleanContent.trim();

    const parsed = JSON.parse(cleanContent);

    if (!parsed?.mainPost || !parsed?.comment1 || !parsed?.comment2) {
      throw new Error('Claude response is missing required fields');
    }

    if (hook && typeof parsed.mainPost === 'string' && !parsed.mainPost.startsWith(hook)) {
      throw new Error('Claude response does not start with the provided hook');
    }

    return NextResponse.json({
      mainPost: parsed.mainPost,
      comment1: parsed.comment1,
      comment2: parsed.comment2,
    }, { status: 200 });
  } catch (error) {
    console.error('[threads/schedule/generate] Error:', error);
    const errorMessage = error instanceof Error ? error.message : '不明なエラー';

    return NextResponse.json({
      error: '投稿生成中にエラーが発生しました',
      details: errorMessage,
    }, { status: 500 });
  }
}
