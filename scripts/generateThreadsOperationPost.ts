#!/usr/bin/env ts-node

/**
 * Threads運用系投稿生成スクリプト
 *
 * 使い方:
 * npx ts-node scripts/generateThreadsOperationPost.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { THREADS_OPERATION_PROMPT } from '../src/lib/threadsOperationPrompt';

// .env.localを読み込む
config({ path: resolve(process.cwd(), '.env.local') });

const CLAUDE_API_URL = process.env.CLAUDE_API_URL?.trim() ?? 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY?.trim();
const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

interface GenerateRequest {
  theme: string;
  competitorExamples?: string[];
  pattern?: 1 | 2 | 3 | 4 | 5 | 6;
}

interface ClaudeResponse {
  mainPost: string;
  comment1: string;
  comment2: string;
}

async function requestClaude(prompt: string): Promise<any> {
  if (!CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY is not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000); // 2分タイムアウト

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
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
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

  try {
    return JSON.parse(cleanContent);
  } catch (error) {
    console.error('Failed to parse JSON:', cleanContent);
    throw error;
  }
}

function buildPrompt(request: GenerateRequest): string {
  const competitorSection = request.competitorExamples && request.competitorExamples.length > 0
    ? [
        '\n## 競合の類似投稿例',
        ...request.competitorExamples.map((example, idx) => `### 競合例${idx + 1}\n${example}`),
        '',
      ].join('\n')
    : '';

  const patternHint = request.pattern
    ? `\n**推奨パターン**: パターン${request.pattern}を使用してください。\n`
    : '';

  return [
    THREADS_OPERATION_PROMPT,
    '',
    '# 今回の生成依頼',
    `## テーマ`,
    request.theme,
    competitorSection,
    patternHint,
    '## 出力形式',
    '以下のJSON形式で返してください（markdown不要）:',
    '{',
    '  "mainPost": "メイン投稿150-200文字",',
    '  "comment1": "コメント1: 必ず400文字以上、最大500文字",',
    '  "comment2": "コメント2: 必ず400文字以上、最大500文字"',
    '}',
  ].join('\n');
}

export async function generateThreadsOperationPost(request: GenerateRequest): Promise<ClaudeResponse> {
  const prompt = buildPrompt(request);
  console.log('[generateThreadsOperationPost] Generating post for theme:', request.theme);

  const result = await requestClaude(prompt);

  if (!result || typeof result !== 'object') {
    throw new Error('Invalid response format');
  }

  return {
    mainPost: result.mainPost || '',
    comment1: result.comment1 || '',
    comment2: result.comment2 || '',
  };
}

// CLI実行時
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('使い方: npx ts-node scripts/generateThreadsOperationPost.ts "テーマ" ["競合例1"] ["競合例2"]');
  console.log('例: npx ts-node scripts/generateThreadsOperationPost.ts "フォロワーが増えない原因と対策"');
  process.exit(1);
}

const theme = args[0];
const competitorExamples = args.slice(1);

generateThreadsOperationPost({
  theme,
  competitorExamples: competitorExamples.length > 0 ? competitorExamples : undefined,
})
  .then((result) => {
    console.log('\n=== 生成結果 ===\n');
    console.log('【メイン投稿】');
    console.log(result.mainPost);
    console.log('\n【コメント1】');
    console.log(result.comment1);
    console.log('\n【コメント2】');
    console.log(result.comment2);
    console.log('\n================\n');
  })
  .catch((error) => {
    console.error('エラー:', error.message);
    process.exit(1);
  });
