import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { BigQuery } from '@google-cloud/bigquery';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

type PlanRow = {
  plan_id?: string;
  main_text?: string;
  original_main_text?: string;
  comments?: unknown;
  original_comments?: unknown;
  updated_at?: string | Date;
};

type PhraseStat = {
  phrase: string;
  count: number;
};

type StructuralSummary = {
  emojiAddedCount: number;
  lineCtaAddedCount: number;
  bulletAddedCount: number;
};

type LearningInsertParams = {
  learningId: string;
  analysisStart: string;
  analysisEnd: string;
  summary: string;
  sampleCount: number;
  avgCharDelta: number | null;
};

type EditAnalysisResult = {
  avgCharDelta: number | null;
  sampleCount: number;
  removedPhrases: PhraseStat[];
  addedPhrases: PhraseStat[];
  structuralPatterns: { pattern: string; frequency: number; count: number }[];
};

const DATASET = process.env.BQ_DATASET_ID?.trim() || 'autostudio_threads';
const LEARNINGS_TABLE = 'thread_prompt_learnings';
const THREAD_PLAN_TABLE = 'thread_post_plans';
const MIN_PHRASE_LENGTH = 10;
const MAX_SUMMARY_LENGTH = 2000; // 約500トークンを想定した文字数上限

const emojiRegex = /^\p{Extended_Pictographic}/u;
const bulletRegex = /(^|\n)\s*(?:[-*・●▶︎▶️]|[0-9０-９]+\.|[①-⑳])/;

function ensureBigQueryClient(): BigQuery {
  const projectId = resolveProjectId(process.env.BQ_PROJECT_ID || undefined);
  return createBigQueryClient(projectId);
}

function formatDateJst(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
}

function subtractDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * 24 * 60 * 60 * 1000);
}

function parseComments(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((item) => (typeof item === 'string' ? item : String(item ?? ''))).filter(Boolean);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => (typeof item === 'string' ? item : String(item ?? ''))).filter(Boolean);
      }
    } catch (error) {
      // Fallback: split by double newline
      return trimmed
        .split(/\n{2,}/)
        .map((segment) => segment.trim())
        .filter(Boolean);
    }
  }
  return [];
}

type DiffOperation = { type: 'equal' | 'add' | 'remove'; value: string };

function diffStrings(original: string, edited: string): DiffOperation[] {
  const a = original ?? '';
  const b = edited ?? '';
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const ops: DiffOperation[] = [];
  let i = m;
  let j = n;

  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      ops.push({ type: 'equal', value: a[i - 1] });
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      ops.push({ type: 'remove', value: a[i - 1] });
      i -= 1;
    } else {
      ops.push({ type: 'add', value: b[j - 1] });
      j -= 1;
    }
  }

  while (i > 0) {
    ops.push({ type: 'remove', value: a[i - 1] });
    i -= 1;
  }

  while (j > 0) {
    ops.push({ type: 'add', value: b[j - 1] });
    j -= 1;
  }

  ops.reverse();

  const merged: DiffOperation[] = [];
  for (const op of ops) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) {
      last.value += op.value;
    } else {
      merged.push({ type: op.type, value: op.value });
    }
  }

  return merged;
}

function normalizePhrase(raw: string): string | null {
  if (!raw) return null;
  const normalized = raw.replace(/\s+/g, ' ').trim();
  if (normalized.length < MIN_PHRASE_LENGTH) return null;
  return normalized;
}

function collectPhraseStats(
  operations: DiffOperation[],
  removedMap: Map<string, PhraseStat>,
  addedMap: Map<string, PhraseStat>,
): void {
  for (const op of operations) {
    if (op.type === 'equal') continue;
    const normalized = normalizePhrase(op.value);
    if (!normalized) continue;
    const targetMap = op.type === 'remove' ? removedMap : addedMap;
    const existing = targetMap.get(normalized);
    if (existing) {
      existing.count += 1;
    } else {
      targetMap.set(normalized, { phrase: normalized, count: 1 });
    }
  }
}

function toPlainString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toISOString();
  return String(value ?? '');
}

function differenceInDaysJst(later: string, earlier: string): number {
  const [laterY, laterM, laterD] = later.split('-').map(Number);
  const [earlierY, earlierM, earlierD] = earlier.split('-').map(Number);
  const laterUtc = Date.UTC(laterY, (laterM ?? 1) - 1, laterD);
  const earlierUtc = Date.UTC(earlierY, (earlierM ?? 1) - 1, earlierD);
  const diffMs = laterUtc - earlierUtc;
  return Math.max(0, Math.round(diffMs / (24 * 60 * 60 * 1000)));
}

function analyzeEdits(rows: PlanRow[], analysisEndDate: string): EditAnalysisResult {
  if (!rows.length) {
    return {
      avgCharDelta: null,
      sampleCount: 0,
      removedPhrases: [],
      addedPhrases: [],
      structuralPatterns: [],
    };
  }

  let weightedDeltaSum = 0;
  let weightTotal = 0;
  let sampleCount = 0;

  const removedMap = new Map<string, PhraseStat>();
  const addedMap = new Map<string, PhraseStat>();
  const structural: StructuralSummary = {
    emojiAddedCount: 0,
    lineCtaAddedCount: 0,
    bulletAddedCount: 0,
  };

  for (const row of rows) {
    const originalMain = toPlainString(row.original_main_text);
    const finalMain = toPlainString(row.main_text);
    if (!originalMain || !finalMain) continue;

    const originalComments = parseComments(row.original_comments);
    const finalComments = parseComments(row.comments);

    const updatedAt = row.updated_at ? new Date(row.updated_at) : new Date();
    const updatedDateJst = formatDateJst(updatedAt);
    const daysAgo = differenceInDaysJst(analysisEndDate, updatedDateJst) + 1;
    const weight = Math.max(1, 31 - Math.min(daysAgo, 30));

    const charDelta = finalMain.length - originalMain.length;
    weightedDeltaSum += charDelta * weight;
    weightTotal += weight;
    sampleCount += 1;

    const mainDiff = diffStrings(originalMain, finalMain);
    collectPhraseStats(mainDiff, removedMap, addedMap);

    const maxComments = Math.max(originalComments.length, finalComments.length);
    for (let index = 0; index < maxComments; index += 1) {
      const originalComment = originalComments[index] ?? '';
      const finalComment = finalComments[index] ?? '';
      if (!originalComment && !finalComment) continue;
      const ops = diffStrings(originalComment, finalComment);
      collectPhraseStats(ops, removedMap, addedMap);
    }

    const originalStartsWithEmoji = emojiRegex.test(originalMain.trimStart());
    const finalStartsWithEmoji = emojiRegex.test(finalMain.trimStart());
    if (!originalStartsWithEmoji && finalStartsWithEmoji) {
      structural.emojiAddedCount += 1;
    }

    const originalContainsLine = originalMain.includes('LINE') || originalComments.some((c) => c.includes('LINE'));
    const finalContainsLine =
      finalMain.includes('LINE') || finalComments.some((c) => c.includes('LINE'));
    if (!originalContainsLine && finalContainsLine) {
      structural.lineCtaAddedCount += 1;
    }

    const originalHasBullet = bulletRegex.test(originalMain) || originalComments.some((c) => bulletRegex.test(c));
    const finalHasBullet = bulletRegex.test(finalMain) || finalComments.some((c) => bulletRegex.test(c));
    if (!originalHasBullet && finalHasBullet) {
      structural.bulletAddedCount += 1;
    }
  }

  const avgCharDelta = weightTotal > 0 ? Math.round(weightedDeltaSum / weightTotal) : null;
  const removedPhrases = Array.from(removedMap.values())
    .filter((item) => item.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const addedPhrases = Array.from(addedMap.values())
    .filter((item) => item.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const structuralPatterns = [
    { pattern: '冒頭に絵文字追加', count: structural.emojiAddedCount },
    { pattern: '最後にLINE誘導', count: structural.lineCtaAddedCount },
    { pattern: '箇条書き化', count: structural.bulletAddedCount },
  ]
    .filter((item) => item.count > 0)
    .map((item) => ({
      pattern: item.pattern,
      count: item.count,
      frequency: sampleCount > 0 ? Number((item.count / sampleCount).toFixed(2)) : 0,
    }));

  return {
    avgCharDelta,
    sampleCount,
    removedPhrases,
    addedPhrases,
    structuralPatterns,
  };
}

async function ensureLearningsTable(client: BigQuery, projectId: string): Promise<void> {
  const ddl = `
    CREATE TABLE IF NOT EXISTS \`${projectId}.${DATASET}.${LEARNINGS_TABLE}\` (
      learning_id STRING NOT NULL,
      generated_at TIMESTAMP NOT NULL,
      analysis_period_start DATE NOT NULL,
      analysis_period_end DATE NOT NULL,
      learning_summary STRING NOT NULL,
      sample_count INT64 NOT NULL,
      avg_char_delta FLOAT64,
      created_at TIMESTAMP NOT NULL
    )
  `;
  await client.query({ query: ddl });
}

async function fetchPlanRows(client: BigQuery, projectId: string, analysisStart: string, analysisEnd: string) {
  const sql = `
    SELECT
      plan_id,
      main_text,
      original_main_text,
      comments,
      original_comments,
      updated_at
    FROM \`${projectId}.${DATASET}.${THREAD_PLAN_TABLE}\`
    WHERE original_main_text IS NOT NULL
      AND main_text IS NOT NULL
      AND status = 'approved'
      AND DATE(updated_at, 'Asia/Tokyo') BETWEEN @analysisStart AND @analysisEnd
  `;

  const [rows] = await client.query({
    query: sql,
    params: { analysisStart, analysisEnd },
  });

  return rows as PlanRow[];
}

function buildLearningSummary(result: EditAnalysisResult, sampleCount: number, avgCharDelta: number | null): string {
  const summaryLines: string[] = [];
  summaryLines.push(`## ユーザー編集パターン（直近30日、${sampleCount}投稿分析）`);
  summaryLines.push('');

  if (avgCharDelta === null) {
    summaryLines.push('**文字数**: 有効な編集データが不足しています');
  } else if (avgCharDelta === 0) {
    summaryLines.push('**文字数**: 文字数の増減はほぼありません（±0文字）');
  } else if (avgCharDelta < 0) {
    summaryLines.push(`**文字数**: より簡潔な投稿を好む（平均${Math.abs(avgCharDelta)}文字短縮）`);
  } else {
    summaryLines.push(`**文字数**: 文字数を追加する傾向（平均+${avgCharDelta}文字）`);
  }

  summaryLines.push('');

  if (result.removedPhrases.length) {
    summaryLines.push('**削除される表現**（3回以上）:');
    for (const item of result.removedPhrases) {
      summaryLines.push(`- 「${item.phrase}」（${item.count}回削除）`);
    }
  } else {
    summaryLines.push('**削除される表現**: 3回以上繰り返し削除された表現はありません');
  }

  summaryLines.push('');

  if (result.addedPhrases.length) {
    summaryLines.push('**追加される表現**（3回以上）:');
    for (const item of result.addedPhrases) {
      summaryLines.push(`- 「${item.phrase}」（${item.count}回追加）`);
    }
  } else {
    summaryLines.push('**追加される表現**: 3回以上繰り返し追加された表現はありません');
  }

  summaryLines.push('');

  if (result.structuralPatterns.length) {
    summaryLines.push('**構造的パターン**:');
    for (const item of result.structuralPatterns) {
      summaryLines.push(`- ${item.pattern}（${item.count}/${sampleCount}投稿）`);
    }
  } else {
    summaryLines.push('**構造的パターン**: 顕著な変化は検出されませんでした');
  }

  let summary = summaryLines.join('\n');
  if (summary.length > MAX_SUMMARY_LENGTH) {
    summary = `${summary.slice(0, MAX_SUMMARY_LENGTH - 1)}…`;
  }
  return summary;
}

async function insertLearning(client: BigQuery, projectId: string, params: LearningInsertParams): Promise<void> {
  const sql = `
    INSERT INTO \`${projectId}.${DATASET}.${LEARNINGS_TABLE}\`
      (learning_id, generated_at, analysis_period_start, analysis_period_end, learning_summary, sample_count, avg_char_delta, created_at)
    VALUES
      (@learningId, CURRENT_TIMESTAMP(), @analysisStart, @analysisEnd, @summary, @sampleCount, @avgCharDelta, CURRENT_TIMESTAMP())
  `;

  await client.query({
    query: sql,
    params: {
      learningId: params.learningId,
      analysisStart: params.analysisStart,
      analysisEnd: params.analysisEnd,
      summary: params.summary,
      sampleCount: params.sampleCount,
      avgCharDelta: params.avgCharDelta,
    },
    types: {
      avgCharDelta: 'FLOAT64',
    },
  });
}

async function main() {
  const projectId = resolveProjectId(process.env.BQ_PROJECT_ID || undefined);
  const client = ensureBigQueryClient();

  await ensureLearningsTable(client, projectId);

  const analysisEnd = new Date();
  const analysisEndDate = formatDateJst(analysisEnd);
  const analysisStartDate = formatDateJst(subtractDays(analysisEnd, 29));

  console.log('[extract-edit-patterns] Analysis period:', {
    start: analysisStartDate,
    end: analysisEndDate,
  });

  const planRows = await fetchPlanRows(client, projectId, analysisStartDate, analysisEndDate);
  console.log('[extract-edit-patterns] Retrieved plans:', planRows.length);

  const analysis = analyzeEdits(planRows, analysisEndDate);

  if (analysis.sampleCount === 0) {
    console.log('[extract-edit-patterns] No approved plans with edit history found in the period. Skipping insert.');
    return;
  }

  const summary = buildLearningSummary(analysis, analysis.sampleCount, analysis.avgCharDelta);
  const params: LearningInsertParams = {
    learningId: uuidv4(),
    analysisStart: analysisStartDate,
    analysisEnd: analysisEndDate,
    summary,
    sampleCount: analysis.sampleCount,
    avgCharDelta: analysis.avgCharDelta,
  };

  await insertLearning(client, projectId, params);

  console.log(
    JSON.stringify(
      {
        analysisPeriod: { start: analysisStartDate, end: analysisEndDate },
        avgCharDelta: analysis.avgCharDelta,
        sampleCount: analysis.sampleCount,
        removedPhrases: analysis.removedPhrases,
        addedPhrases: analysis.addedPhrases,
        structuralPatterns: analysis.structuralPatterns,
      },
      null,
      2,
    ),
  );

  console.log('[extract-edit-patterns] Learning summary inserted with ID:', params.learningId);
}

main().catch((error) => {
  console.error('[extract-edit-patterns] Failed to extract patterns:', error);
  process.exitCode = 1;
});
