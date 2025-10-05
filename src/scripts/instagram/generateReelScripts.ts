#!/usr/bin/env tsx

import { config } from 'dotenv';
config({ path: '.env.local' });
import { randomUUID } from 'node:crypto';
import { BigQuery } from '@google-cloud/bigquery';
import { loadInstagramConfig } from '@/lib/instagram/config';
import { createInstagramBigQuery, ensureInstagramTables } from '@/lib/instagram/bigquery';

interface TranscriptRow {
  summary: string;
  key_points: string[];
  hooks: string[];
  cta_ideas: string[];
}

interface InsightRow {
  metric: string;
  value: number;
}

async function main(): Promise<void> {
  const config = loadInstagramConfig();
  const bigquery = createInstagramBigQuery();
  await ensureInstagramTables(bigquery);

  const transcripts = await fetchRecentTranscripts(bigquery, config);
  const insights = await fetchRecentInsights(bigquery, config);

  if (transcripts.length === 0) {
    console.warn('[instagram/generate] No transcripts available');
    return;
  }

  const prompt = buildClaudePrompt({ transcripts, insights });
  const completion = await callClaude(config, prompt);
  await persistScripts(bigquery, config, completion);
  console.log('[instagram/generate] Scripts saved');
}

async function fetchRecentTranscripts(bigquery: BigQuery, config: ReturnType<typeof loadInstagramConfig>): Promise<TranscriptRow[]> {
  const query = `
    SELECT summary, key_points, hooks, cta_ideas
    FROM \
\`${config.projectId}.${config.dataset}.competitor_reels_transcripts\`
    WHERE snapshot_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
    ORDER BY snapshot_date DESC
    LIMIT 20
  `;
  const [rows] = await bigquery.query(query, { location: config.location });
  return rows as TranscriptRow[];
}

async function fetchRecentInsights(bigquery: BigQuery, config: ReturnType<typeof loadInstagramConfig>): Promise<InsightRow[]> {
  const query = `
    SELECT metric, value
    FROM (
      SELECT 'views' AS metric, SUM(views) AS value FROM \
\`${config.projectId}.autostudio_instagram.instagram_reels\`
      WHERE timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 14 DAY)
    )
  `;
  try {
    const [rows] = await bigquery.query(query, { location: config.location });
    return rows as InsightRow[];
  } catch (error) {
    console.warn('[instagram/generate] Failed to load ANALYCA insights. Continuing with transcripts only.', error);
    return [];
  }
}

function buildClaudePrompt(params: { transcripts: TranscriptRow[]; insights: InsightRow[] }): string {
  const { transcripts, insights } = params;
  const transcriptText = transcripts
    .map((item, index) => {
      const hooks = item.hooks?.join(' / ') ?? 'N/A';
      const keyPoints = item.key_points?.join(' / ') ?? 'N/A';
      const ctaIdeas = item.cta_ideas?.join(' / ') ?? 'N/A';
      return `### 競合${index + 1}\n- 要約: ${item.summary}\n- Hook: ${hooks}\n- KeyPoints: ${keyPoints}\n- CTA Ideas: ${ctaIdeas}`;
    })
    .join('\n\n');

  const insightText = insights.length
    ? insights.map((item) => `${item.metric}: ${item.value}`).join('\n')
    : '（自社指標は取得できませんでした）';

  return [
    'あなたはInstagramリールのシナリオプランナーです。',
    '以下の競合分析を参考に、AI系とSNS運用系アカウント向けの台本を 2 本生成してください。',
    '',
    '## 自社直近実績',
    insightText,
    '',
    '## 競合要約',
    transcriptText,
    '',
    '### 出力要件',
    'JSON 形式で以下の配列を返してください。',
    '[',
    '  {',
    '    "title": "タイトル",',
    '    "hook": "冒頭5秒の台本",',
    '    "body": "本編の台本。箇条書き可",',
    '    "cta": "CTA",',
    '    "story_text": "ストーリーズ用の補足文",',
    '    "inspiration_sources": ["参照した競合インサイト"]',
    '  }',
    ']',
    '',
    '注意: 競合の台詞をそのまま使用せず、抽象化したアイデアを基にオリジナル台本を作成してください。',
  ].join('\n');
}

async function callClaude(config: ReturnType<typeof loadInstagramConfig>, prompt: string): Promise<unknown> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'x-api-key': config.claudeApiKey,
    },
    body: JSON.stringify({
      model: config.claudeModel,
      max_tokens: 1500,
      temperature: 0.6,
      system: 'あなたはInstagramリールの台本作成をサポートするアシスタントです。',
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
    throw new Error(`Claude API error: ${text}`);
  }

  const data = await response.json();
  const content = data?.content?.[0]?.text;
  if (!content) {
    throw new Error('Claude API did not return content');
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to parse Claude response: ${content} (reason: ${(error as Error).message ?? 'unknown'})`,
    );
  }
}

async function persistScripts(
  bigquery: BigQuery,
  config: ReturnType<typeof loadInstagramConfig>,
  payload: unknown,
): Promise<void> {
  if (!Array.isArray(payload)) {
    throw new Error('Claude payload must be an array');
  }

  const dataset = bigquery.dataset(config.dataset);
  const table = dataset.table('my_reels_scripts');
  const today = new Date();
  const snapshotDate = today.toISOString().slice(0, 10);

  const rows = payload.slice(0, 2).map((item) => {
    const script = item as Record<string, unknown>;
    return {
      snapshot_date: snapshotDate,
      script_id: randomUUID(),
      title: String(script.title ?? 'Untitled'),
      hook: String(script.hook ?? ''),
      body: String(script.body ?? ''),
      cta: String(script.cta ?? ''),
      story_text: String(script.story_text ?? ''),
      inspiration_sources: Array.isArray(script.inspiration_sources)
        ? script.inspiration_sources.map((value) => String(value))
        : [],
    };
  });

  await table.insert(rows);
}

main().catch((error) => {
  console.error('[instagram/generate] Failed', error);
  process.exitCode = 1;
});
