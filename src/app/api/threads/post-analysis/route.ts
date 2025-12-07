import { NextResponse } from 'next/server';
import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';

interface PatternStats {
  pattern: string;
  count: number;
  avgImpressions: number;
  avgLikes: number;
  examples: Array<{ text: string; impressions: number }>;
}

interface AnalysisResponse {
  totalPosts: number;
  avgImpressions: number;
  avgLikes: number;
  patternAnalysis: PatternStats[];
  startDate: string;
  endDate: string;
}

function isValidDate(dateStr: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(dateStr)) return false;
  const date = new Date(dateStr);
  return !Number.isNaN(date.getTime());
}

// 【メイン投稿】などのプレフィックスを除去して実際の1行目を取得
function getFirstRealLine(content: string): string {
  const lines = (content || '').split('\n').filter((l) => l.trim());
  for (const line of lines) {
    const cleaned = line
      .replace(/^【メイン投稿】\s*/, '')
      .replace(/^【コメント欄\d+】\s*/, '')
      .trim();
    if (cleaned && !cleaned.startsWith('【')) {
      return cleaned;
    }
  }
  return '';
}

export async function GET(request: Request) {
  if (!PROJECT_ID) {
    return NextResponse.json({ error: 'Project ID is not configured' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }

  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return NextResponse.json({ error: 'Invalid date format. Use YYYY-MM-DD' }, { status: 400 });
  }

  try {
    const client = createBigQueryClient(PROJECT_ID);

    const [rows] = await client.query({
      query: `
        SELECT
          content,
          impressions_total as impressions,
          likes_total as likes
        FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
        WHERE posted_at IS NOT NULL
          AND DATE(posted_at) BETWEEN @startDate AND @endDate
        ORDER BY impressions_total DESC
      `,
      params: { startDate, endDate },
    });

    const posts = rows as Array<{ content: string; impressions: number; likes: number }>;

    if (posts.length === 0) {
      const emptyResponse: AnalysisResponse = {
        totalPosts: 0,
        avgImpressions: 0,
        avgLikes: 0,
        patternAnalysis: [],
        startDate,
        endDate,
      };
      return NextResponse.json(emptyResponse, { status: 200 });
    }

    // 基本統計
    const totalPosts = posts.length;
    const avgImpressions = Math.round(
      posts.reduce((sum, p) => sum + (p.impressions || 0), 0) / totalPosts
    );
    const avgLikes = Math.round(posts.reduce((sum, p) => sum + (p.likes || 0), 0) / totalPosts);

    // 冒頭パターン分析（優先順位順）
    const patterns: Array<{ name: string; regex: RegExp }> = [
      { name: '緊急・ヤバい系', regex: /(緊急|速報|ヤバい|ヤバすぎ)/ },
      { name: '〜してる人系', regex: /(してる人|やってる人|使ってる人|書いてる人)/ },
      { name: '時代遅れ系', regex: /時代遅れ/ },
      { name: '損してます系', regex: /(損して|損します|無駄|もったいない)/ },
      { name: '間違ってます系', regex: /(間違って|間違えて)/ },
      { name: '終わります系', regex: /(終わって|終わります|アウト)/ },
      { name: '〜だけで系', regex: /(だけで|するだけ)/ },
      { name: '実は系', regex: /実は/ },
      { name: '多すぎ系', regex: /多すぎ/ },
      { name: '質問系', regex: /[？?]$/ },
      { name: '数字・具体性', regex: /(\d+分|\d+時間|\d+倍|\d+人|\d+%)/ },
    ];

    const patternStats: Record<
      string,
      { count: number; totalImp: number; totalLikes: number; examples: Array<{ text: string; impressions: number }> }
    > = {};
    patterns.forEach((p) => {
      patternStats[p.name] = { count: 0, totalImp: 0, totalLikes: 0, examples: [] };
    });
    patternStats['その他'] = { count: 0, totalImp: 0, totalLikes: 0, examples: [] };

    posts.forEach((p) => {
      const firstLine = getFirstRealLine(p.content);
      let matched = false;

      for (const { name, regex } of patterns) {
        if (regex.test(firstLine)) {
          patternStats[name].count++;
          patternStats[name].totalImp += p.impressions || 0;
          patternStats[name].totalLikes += p.likes || 0;
          if (patternStats[name].examples.length < 2) {
            patternStats[name].examples.push({
              text: firstLine.slice(0, 60),
              impressions: p.impressions || 0,
            });
          }
          matched = true;
          break;
        }
      }

      if (!matched) {
        patternStats['その他'].count++;
        patternStats['その他'].totalImp += p.impressions || 0;
        patternStats['その他'].totalLikes += p.likes || 0;
        if (patternStats['その他'].examples.length < 3) {
          patternStats['その他'].examples.push({
            text: firstLine.slice(0, 60),
            impressions: p.impressions || 0,
          });
        }
      }
    });

    const patternAnalysis: PatternStats[] = Object.entries(patternStats)
      .filter(([, s]) => s.count > 0)
      .map(([pattern, s]) => ({
        pattern,
        count: s.count,
        avgImpressions: Math.round(s.totalImp / s.count),
        avgLikes: Math.round(s.totalLikes / s.count),
        examples: s.examples,
      }))
      .sort((a, b) => b.avgImpressions - a.avgImpressions);

    const response: AnalysisResponse = {
      totalPosts,
      avgImpressions,
      avgLikes,
      patternAnalysis,
      startDate,
      endDate,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[api/threads/post-analysis] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch analysis data' },
      { status: 500 }
    );
  }
}
