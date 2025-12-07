import { NextRequest, NextResponse } from 'next/server';
import { resolveProjectId, createBigQueryClient } from '@/lib/bigquery';
import { countLineSourceRegistrations } from '@/lib/lstep/dashboard';

const PROJECT_ID = resolveProjectId();
const DATASET = 'autostudio_threads';
const REPORT_TABLE = 'threads_reports';

interface TopPost {
  postId: string;
  content: string;
  impressions: number;
  likes: number;
  likeRate: number;
  postedAt: string;
  dayOfWeek: string;
  timeSlot: string;
  hour: number;
  // 詳細分析用
  hook: string; // フック（書き出し）
  charCount: number; // 文字数
  lineCount: number; // 行数
  usesKakko: boolean; // 【】使用
  usesQuote: boolean; // 「」使用
}

interface TimeSlotPerformance {
  slot: string;
  label: string;
  postsCount: number;
  totalImpressions: number;
  avgImpressions: number;
  winnerCount: number;
  winRate: number;
}

interface ActionPlan {
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

interface AvoidItem {
  title: string;
  reason: string;
}

interface WeeklyPlanItem {
  timeSlot: string;
  postsPerDay: number;
  focus: string;
}

interface DailyMetric {
  date: string;
  followers: number;
  followersDelta: number;
  impressions: number;
  likes: number;
  postsCount: number;
  winnerCount: number;
  lineRegistrations: number;
}

interface HourlyPerformance {
  hour: number;
  label: string;
  postsCount: number;
  totalImpressions: number;
  avgImpressions: number;
  winnerCount: number;
  winRate: number;
}

interface DayOfWeekPerformance {
  dayOfWeek: number;
  label: string;
  postsCount: number;
  totalImpressions: number;
  avgImpressions: number;
  winnerCount: number;
  winRate: number;
}

interface Insights {
  keyInsights: string[];
  bestTimeSlot: { label: string; avgImpressions: number; winRate: number };
  bestDayOfWeek: { label: string; avgImpressions: number; winRate: number };
  topPostInsight: string;
  recommendations: string[];
  // 教材化ポイント
  teachingPoints: string[];
  // アクションプラン
  actionPlans: ActionPlan[];
  // 避けるべきこと
  avoidItems: AvoidItem[];
  // 週間投稿計画
  weeklyPlan: WeeklyPlanItem[];
}

interface MonthlyReportData {
  reportId: string;
  reportType: 'monthly';
  period: {
    year: number;
    month: number;
    startDate: string;
    endDate: string;
    label: string;
  };
  summary: {
    totalPosts: number;
    totalImpressions: number;
    totalLikes: number;
    avgImpressions: number;
    avgLikeRate: number;
    winnerCount: number;
    winRate: number;
    followerStart: number;
    followerEnd: number;
    followerChange: number;
    lineRegistrations: number;
    dailyAvgPosts: number;
  };
  dailyMetrics: DailyMetric[];
  topPosts: TopPost[];
  hourlyPerformance: HourlyPerformance[];
  dayOfWeekPerformance: DayOfWeekPerformance[];
  timeSlotPerformance: TimeSlotPerformance[];
  insights: Insights;
  generatedAt: string;
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const TIME_SLOT_LABELS: Record<string, string> = {
  '0': '早朝(0-6時)',
  '6': '朝(6-9時)',
  '9': '午前(9-12時)',
  '12': '昼(12-15時)',
  '15': '午後(15-18時)',
  '18': '夜(18-21時)',
  '21': '深夜(21-24時)',
};

function getTimeSlot(hour: number): string {
  if (hour < 6) return '0';
  if (hour < 9) return '6';
  if (hour < 12) return '9';
  if (hour < 15) return '12';
  if (hour < 18) return '15';
  if (hour < 21) return '18';
  return '21';
}

async function ensureReportTable() {
  const client = createBigQueryClient(PROJECT_ID);
  const sql = `
    CREATE TABLE IF NOT EXISTS \`${PROJECT_ID}.${DATASET}.${REPORT_TABLE}\` (
      report_id STRING NOT NULL,
      report_type STRING NOT NULL,
      period_year INT64,
      period_month INT64,
      period_week INT64,
      start_date DATE,
      end_date DATE,
      report_data JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
    )
  `;
  await client.query({ query: sql });
}

async function generateMonthlyReport(year: number, month: number): Promise<MonthlyReportData> {
  const client = createBigQueryClient(PROJECT_ID);

  const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;

  const reportId = `monthly-${year}-${month.toString().padStart(2, '0')}`;

  // 1. 日別メトリクス取得（フォロワー増減とLINE登録も含む）
  const dailyMetricsSql = `
    WITH daily_posts AS (
      SELECT
        DATE(posted_at) AS date,
        COUNT(*) AS posts_count,
        SUM(impressions_total) AS total_impressions,
        SUM(likes_total) AS total_likes,
        COUNTIF(impressions_total >= 10000) AS winner_count
      FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
      WHERE DATE(posted_at) BETWEEN '${startDate}' AND '${endDate}'
      GROUP BY DATE(posted_at)
    ),
    daily_followers AS (
      SELECT
        date,
        followers_snapshot AS followers,
        followers_snapshot - LAG(followers_snapshot) OVER (ORDER BY date) AS followers_delta
      FROM \`${PROJECT_ID}.${DATASET}.threads_daily_metrics\`
      WHERE date BETWEEN DATE_SUB('${startDate}', INTERVAL 1 DAY) AND '${endDate}'
    ),
    daily_line AS (
      SELECT
        DATE(registered_at) AS date,
        COUNTIF(source_name = 'Threads') AS line_threads
      FROM \`${PROJECT_ID}.autostudio_lstep.lstep_friends_raw\`
      WHERE DATE(registered_at) BETWEEN '${startDate}' AND '${endDate}'
      GROUP BY DATE(registered_at)
    )
    SELECT
      COALESCE(dp.date, df.date) AS date,
      COALESCE(df.followers, 0) AS followers,
      COALESCE(df.followers_delta, 0) AS followers_delta,
      COALESCE(dp.total_impressions, 0) AS impressions,
      COALESCE(dp.total_likes, 0) AS likes,
      COALESCE(dp.posts_count, 0) AS posts_count,
      COALESCE(dp.winner_count, 0) AS winner_count,
      COALESCE(dl.line_threads, 0) AS line_registrations
    FROM daily_posts dp
    FULL OUTER JOIN daily_followers df ON dp.date = df.date
    LEFT JOIN daily_line dl ON dp.date = dl.date
    WHERE COALESCE(dp.date, df.date) BETWEEN '${startDate}' AND '${endDate}'
    ORDER BY date
  `;

  const [dailyRows] = await client.query({ query: dailyMetricsSql });
  const dailyMetrics: DailyMetric[] = (dailyRows as Array<Record<string, unknown>>).map((row) => {
    const dateValue = row.date;
    const dateStr = typeof dateValue === 'object' && dateValue !== null && 'value' in (dateValue as object)
      ? String((dateValue as { value: string }).value)
      : String(dateValue ?? '').split('T')[0];

    return {
      date: dateStr,
      followers: Number(row.followers ?? 0),
      followersDelta: Number(row.followers_delta ?? 0),
      impressions: Number(row.impressions ?? 0),
      likes: Number(row.likes ?? 0),
      postsCount: Number(row.posts_count ?? 0),
      winnerCount: Number(row.winner_count ?? 0),
      lineRegistrations: Number(row.line_registrations ?? 0),
    };
  });

  // 2. インプレッション上位10投稿を取得（勝ち投稿に限らず）
  const topPostsSql = `
    SELECT
      post_id,
      content,
      impressions_total AS impressions,
      likes_total AS likes,
      SAFE_DIVIDE(likes_total, impressions_total) * 100 AS like_rate,
      FORMAT_TIMESTAMP('%Y-%m-%d %H:%M', posted_at, 'Asia/Tokyo') AS posted_at,
      EXTRACT(DAYOFWEEK FROM posted_at) - 1 AS day_of_week,
      EXTRACT(HOUR FROM posted_at) AS hour
    FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
    WHERE DATE(posted_at) BETWEEN '${startDate}' AND '${endDate}'
    ORDER BY impressions_total DESC
    LIMIT 10
  `;

  const [topPostsRows] = await client.query({ query: topPostsSql });
  const topPosts: TopPost[] = (topPostsRows as Array<Record<string, unknown>>).map((row) => {
    const hour = Number(row.hour ?? 0);
    const dayOfWeek = Number(row.day_of_week ?? 0);
    const content = String(row.content ?? '');

    // フック（書き出し）を抽出 - 最初の改行までまたは100文字
    const firstLineEnd = content.indexOf('\n');
    const hook = firstLineEnd > 0 ? content.substring(0, firstLineEnd) : content.substring(0, 100);

    // 行数をカウント
    const lineCount = content.split('\n').filter(line => line.trim()).length;

    return {
      postId: String(row.post_id ?? ''),
      content,
      impressions: Number(row.impressions ?? 0),
      likes: Number(row.likes ?? 0),
      likeRate: Number(row.like_rate ?? 0),
      postedAt: String(row.posted_at ?? ''),
      dayOfWeek: DAY_LABELS[dayOfWeek] ?? '',
      timeSlot: TIME_SLOT_LABELS[getTimeSlot(hour)] ?? '',
      hour,
      hook,
      charCount: content.length,
      lineCount,
      usesKakko: content.includes('【') && content.includes('】'),
      usesQuote: content.includes('「') && content.includes('」'),
    };
  });

  // 3. 時間帯別パフォーマンス
  const hourlyPerformanceSql = `
    SELECT
      EXTRACT(HOUR FROM posted_at) AS hour,
      COUNT(*) AS posts_count,
      SUM(impressions_total) AS total_impressions,
      AVG(impressions_total) AS avg_impressions,
      COUNTIF(impressions_total >= 10000) AS winner_count
    FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
    WHERE DATE(posted_at) BETWEEN '${startDate}' AND '${endDate}'
    GROUP BY hour
    ORDER BY hour
  `;

  const [hourlyRows] = await client.query({ query: hourlyPerformanceSql });
  const hourlyPerformance: HourlyPerformance[] = (hourlyRows as Array<Record<string, unknown>>).map((row) => {
    const hour = Number(row.hour ?? 0);
    const postsCount = Number(row.posts_count ?? 0);
    const winnerCount = Number(row.winner_count ?? 0);

    return {
      hour,
      label: `${hour}時`,
      postsCount,
      totalImpressions: Number(row.total_impressions ?? 0),
      avgImpressions: Math.round(Number(row.avg_impressions ?? 0)),
      winnerCount,
      winRate: postsCount > 0 ? (winnerCount / postsCount) * 100 : 0,
    };
  });

  // 4. 曜日別パフォーマンス
  const dayOfWeekSql = `
    SELECT
      EXTRACT(DAYOFWEEK FROM posted_at) - 1 AS day_of_week,
      COUNT(*) AS posts_count,
      SUM(impressions_total) AS total_impressions,
      AVG(impressions_total) AS avg_impressions,
      COUNTIF(impressions_total >= 10000) AS winner_count
    FROM \`${PROJECT_ID}.${DATASET}.threads_posts\`
    WHERE DATE(posted_at) BETWEEN '${startDate}' AND '${endDate}'
    GROUP BY day_of_week
    ORDER BY day_of_week
  `;

  const [dayOfWeekRows] = await client.query({ query: dayOfWeekSql });
  const dayOfWeekPerformance: DayOfWeekPerformance[] = (dayOfWeekRows as Array<Record<string, unknown>>).map((row) => {
    const dayOfWeek = Number(row.day_of_week ?? 0);
    const postsCount = Number(row.posts_count ?? 0);
    const winnerCount = Number(row.winner_count ?? 0);

    return {
      dayOfWeek,
      label: DAY_LABELS[dayOfWeek] ?? '',
      postsCount,
      totalImpressions: Number(row.total_impressions ?? 0),
      avgImpressions: Math.round(Number(row.avg_impressions ?? 0)),
      winnerCount,
      winRate: postsCount > 0 ? (winnerCount / postsCount) * 100 : 0,
    };
  });

  // 5. 時間帯スロット別パフォーマンス（早朝、朝、昼など）
  const timeSlotPerformance: TimeSlotPerformance[] = [];
  const slotKeys = ['0', '6', '9', '12', '15', '18', '21'];
  for (const slotKey of slotKeys) {
    const slotData = hourlyPerformance.filter(h => getTimeSlot(h.hour) === slotKey);
    if (slotData.length > 0) {
      const totalPosts = slotData.reduce((sum, h) => sum + h.postsCount, 0);
      const totalImp = slotData.reduce((sum, h) => sum + h.totalImpressions, 0);
      const totalWinners = slotData.reduce((sum, h) => sum + h.winnerCount, 0);
      timeSlotPerformance.push({
        slot: slotKey,
        label: TIME_SLOT_LABELS[slotKey],
        postsCount: totalPosts,
        totalImpressions: totalImp,
        avgImpressions: totalPosts > 0 ? Math.round(totalImp / totalPosts) : 0,
        winnerCount: totalWinners,
        winRate: totalPosts > 0 ? (totalWinners / totalPosts) * 100 : 0,
      });
    }
  }

  // 6. LINE登録数取得
  let lineRegistrations = 0;
  try {
    lineRegistrations = await countLineSourceRegistrations(PROJECT_ID, {
      startDate,
      endDate,
      sourceName: 'Threads',
    });
  } catch {
    // Ignore
  }

  // サマリー計算
  const totalPosts = dailyMetrics.reduce((sum, d) => sum + d.postsCount, 0);
  const totalImpressions = dailyMetrics.reduce((sum, d) => sum + d.impressions, 0);
  const totalLikes = dailyMetrics.reduce((sum, d) => sum + d.likes, 0);
  const winnerCount = dailyMetrics.reduce((sum, d) => sum + d.winnerCount, 0);

  const followerValues = dailyMetrics.filter(d => d.followers > 0).map(d => d.followers);
  const followerStart = followerValues[0] ?? 0;
  const followerEnd = followerValues[followerValues.length - 1] ?? followerStart;

  const daysInRange = dailyMetrics.length || 1;

  const monthLabels: Record<number, string> = {
    1: '1月', 2: '2月', 3: '3月', 4: '4月', 5: '5月', 6: '6月',
    7: '7月', 8: '8月', 9: '9月', 10: '10月', 11: '11月', 12: '12月',
  };

  // 7. インサイト生成（アクションプラン、週間計画なども含む）
  const insights = generateInsights({
    totalPosts,
    totalImpressions,
    winnerCount,
    followerChange: followerEnd - followerStart,
    lineRegistrations,
    topPosts,
    hourlyPerformance,
    dayOfWeekPerformance,
    timeSlotPerformance,
    dailyAvgPosts: totalPosts / daysInRange,
  });

  return {
    reportId,
    reportType: 'monthly',
    period: {
      year,
      month,
      startDate,
      endDate,
      label: `${year}年${monthLabels[month]}`,
    },
    summary: {
      totalPosts,
      totalImpressions,
      totalLikes,
      avgImpressions: totalPosts > 0 ? Math.round(totalImpressions / totalPosts) : 0,
      avgLikeRate: totalImpressions > 0 ? (totalLikes / totalImpressions) * 100 : 0,
      winnerCount,
      winRate: totalPosts > 0 ? (winnerCount / totalPosts) * 100 : 0,
      followerStart,
      followerEnd,
      followerChange: followerEnd - followerStart,
      lineRegistrations,
      dailyAvgPosts: totalPosts / daysInRange,
    },
    dailyMetrics,
    topPosts,
    hourlyPerformance,
    dayOfWeekPerformance,
    timeSlotPerformance,
    insights,
    generatedAt: new Date().toISOString(),
  };
}

function generateInsights(data: {
  totalPosts: number;
  totalImpressions: number;
  winnerCount: number;
  followerChange: number;
  lineRegistrations: number;
  topPosts: TopPost[];
  hourlyPerformance: HourlyPerformance[];
  dayOfWeekPerformance: DayOfWeekPerformance[];
  timeSlotPerformance: TimeSlotPerformance[];
  dailyAvgPosts: number;
}): Insights {
  const { totalPosts, totalImpressions, winnerCount, followerChange, lineRegistrations, topPosts, hourlyPerformance, dayOfWeekPerformance, timeSlotPerformance, dailyAvgPosts } = data;

  // ベスト時間帯（平均imp順）
  const bestHour = [...hourlyPerformance].sort((a, b) => b.avgImpressions - a.avgImpressions)[0];
  const bestTimeSlot = bestHour
    ? { label: bestHour.label, avgImpressions: bestHour.avgImpressions, winRate: bestHour.winRate }
    : { label: '-', avgImpressions: 0, winRate: 0 };

  // ベスト曜日（平均imp順）
  const bestDay = [...dayOfWeekPerformance].sort((a, b) => b.avgImpressions - a.avgImpressions)[0];
  const bestDayOfWeek = bestDay
    ? { label: `${bestDay.label}曜日`, avgImpressions: bestDay.avgImpressions, winRate: bestDay.winRate }
    : { label: '-', avgImpressions: 0, winRate: 0 };

  // ベスト時間帯スロット
  const bestSlot = [...timeSlotPerformance].sort((a, b) => b.avgImpressions - a.avgImpressions)[0];
  const worstSlot = [...timeSlotPerformance].sort((a, b) => a.avgImpressions - b.avgImpressions)[0];

  // 勝率が高い時間帯スロット
  const highWinRateSlots = timeSlotPerformance
    .filter(s => s.postsCount >= 10 && s.winRate > 0)
    .sort((a, b) => b.winRate - a.winRate);

  // トップ投稿のインサイト
  const topPost = topPosts[0];
  const topPostInsight = topPost
    ? `最大バズ投稿：${topPost.impressions.toLocaleString()} imp（${topPost.postedAt}、${topPost.dayOfWeek}${topPost.timeSlot}）`
    : '投稿なし';

  // キーインサイト生成
  const keyInsights: string[] = [];

  // 勝ち投稿数に関するインサイト
  if (winnerCount > 0) {
    const winRate = (winnerCount / totalPosts) * 100;
    keyInsights.push(`勝ち投稿（10,000imp+）は${winnerCount}件、勝率${winRate.toFixed(1)}%`);
  } else {
    keyInsights.push('今月は勝ち投稿（10,000imp+）がありませんでした');
  }

  // フォロワー増加に関するインサイト
  if (followerChange > 0) {
    const dailyAvg = Math.round(followerChange / 30);
    keyInsights.push(`フォロワー+${followerChange.toLocaleString()}人増加（1日平均${dailyAvg}人）`);
  }

  // ベスト時間帯スロットのインサイト
  if (bestSlot && bestSlot.avgImpressions > 0) {
    keyInsights.push(`${bestSlot.label}が平均impで最強（${bestSlot.avgImpressions.toLocaleString()}）`);
  }

  // 勝率が高い時間帯のインサイト
  if (highWinRateSlots.length > 0) {
    const best = highWinRateSlots[0];
    keyInsights.push(`${best.label}が勝率最高（${best.winRate.toFixed(1)}%、${best.winnerCount}件）`);
  }

  // ベスト曜日のインサイト
  if (bestDay && bestDay.avgImpressions > 0) {
    keyInsights.push(`${bestDay.label}曜日が平均impで最強（${bestDay.avgImpressions.toLocaleString()}）`);
  }

  // LINE登録に関するインサイト
  if (lineRegistrations > 0) {
    const cvr = (lineRegistrations / totalImpressions) * 100;
    keyInsights.push(`LINE登録${lineRegistrations}件（CVR ${cvr.toFixed(3)}%）`);
  }

  // 教材化ポイント（上位投稿の特徴を分析）
  const teachingPoints: string[] = [];
  if (topPosts.length >= 3) {
    // 文字数の傾向
    const avgCharCount = Math.round(topPosts.slice(0, 5).reduce((sum, p) => sum + p.charCount, 0) / Math.min(5, topPosts.length));
    teachingPoints.push(`上位投稿の平均文字数：${avgCharCount}文字`);

    // 構造の傾向
    const kakkoCount = topPosts.slice(0, 5).filter(p => p.usesKakko).length;
    const quoteCount = topPosts.slice(0, 5).filter(p => p.usesQuote).length;
    if (kakkoCount >= 3) {
      teachingPoints.push('【】を使った見出し構成が効果的');
    }
    if (quoteCount >= 3) {
      teachingPoints.push('「」を使った引用・強調が効果的');
    }

    // 行数の傾向
    const avgLineCount = Math.round(topPosts.slice(0, 5).reduce((sum, p) => sum + p.lineCount, 0) / Math.min(5, topPosts.length));
    teachingPoints.push(`上位投稿の平均行数：${avgLineCount}行`);

    // 時間帯の傾向
    const slotCounts: Record<string, number> = {};
    topPosts.slice(0, 5).forEach(p => {
      slotCounts[p.timeSlot] = (slotCounts[p.timeSlot] || 0) + 1;
    });
    const dominantSlot = Object.entries(slotCounts).sort((a, b) => b[1] - a[1])[0];
    if (dominantSlot && dominantSlot[1] >= 2) {
      teachingPoints.push(`上位投稿は${dominantSlot[0]}に集中`);
    }
  }

  // レコメンデーション生成
  const recommendations: string[] = [];

  // 時間帯に関するレコメンデーション
  if (bestSlot) {
    recommendations.push(`${bestSlot.label}に投稿を集中させると効果的です`);
  }

  // 曜日に関するレコメンデーション
  if (bestDay) {
    const worstDay = [...dayOfWeekPerformance].sort((a, b) => a.avgImpressions - b.avgImpressions)[0];
    if (worstDay && worstDay.avgImpressions < bestDay.avgImpressions * 0.5) {
      recommendations.push(`${worstDay.label}曜日は平均impが低いため、投稿頻度を調整することを検討してください`);
    }
  }

  // 勝率に関するレコメンデーション
  const winRate = totalPosts > 0 ? (winnerCount / totalPosts) * 100 : 0;
  if (winRate < 1) {
    recommendations.push('勝率1%未満のため、より強いフック（書き出し）を意識してみてください');
  } else if (winRate >= 2) {
    recommendations.push(`勝率${winRate.toFixed(1)}%は好調です。この調子を維持しましょう`);
  }

  // トップ投稿のパターンに関するレコメンデーション
  if (topPosts.length >= 3) {
    const commonTimeSlots = topPosts.slice(0, 3).map(p => p.timeSlot);
    const mostCommon = commonTimeSlots.sort((a, b) =>
      commonTimeSlots.filter(v => v === b).length - commonTimeSlots.filter(v => v === a).length
    )[0];
    if (mostCommon) {
      recommendations.push(`上位投稿は${mostCommon}に多い傾向があります`);
    }
  }

  // アクションプラン生成
  const actionPlans: ActionPlan[] = [];

  // ベスト時間帯への集中
  if (bestSlot && worstSlot && bestSlot.avgImpressions > worstSlot.avgImpressions * 1.5) {
    actionPlans.push({
      title: `${bestSlot.label}への投稿集中`,
      description: `${bestSlot.label}は平均${bestSlot.avgImpressions.toLocaleString()}impと最強。投稿の30%以上をこの時間帯に`,
      priority: 'high',
    });
  }

  // 勝率向上
  if (winRate < 2 && highWinRateSlots.length > 0) {
    const bestWinSlot = highWinRateSlots[0];
    actionPlans.push({
      title: `${bestWinSlot.label}の活用強化`,
      description: `勝率${bestWinSlot.winRate.toFixed(1)}%と高い${bestWinSlot.label}での投稿を増やす`,
      priority: 'high',
    });
  }

  // 構造的なアドバイス
  if (topPosts.length >= 3) {
    const kakkoUsage = topPosts.slice(0, 5).filter(p => p.usesKakko).length / Math.min(5, topPosts.length);
    if (kakkoUsage >= 0.6) {
      actionPlans.push({
        title: '【】を使った構成を増やす',
        description: '上位投稿の多くが【】を活用。見出しを入れて構造化する',
        priority: 'medium',
      });
    }
  }

  // 避けるべきこと
  const avoidItems: AvoidItem[] = [];

  if (worstSlot && worstSlot.avgImpressions < 1000) {
    avoidItems.push({
      title: `${worstSlot.label}の投稿`,
      reason: `平均${worstSlot.avgImpressions.toLocaleString()}impと低パフォーマンス`,
    });
  }

  const worstDay = [...dayOfWeekPerformance].sort((a, b) => a.avgImpressions - b.avgImpressions)[0];
  if (worstDay && bestDay && worstDay.avgImpressions < bestDay.avgImpressions * 0.4) {
    avoidItems.push({
      title: `${worstDay.label}曜日の重点投稿`,
      reason: `平均${worstDay.avgImpressions.toLocaleString()}impと${bestDay.label}曜日の半分以下`,
    });
  }

  if (winRate < 1) {
    avoidItems.push({
      title: '短文投稿（100文字以下）',
      reason: '勝率が低いため、400-600文字の中長文を推奨',
    });
  }

  // 週間投稿計画
  const weeklyPlan: WeeklyPlanItem[] = [];
  const avgPostsPerDay = Math.round(dailyAvgPosts);

  // ゴールデンタイムを特定して計画を作成
  const sortedSlots = [...timeSlotPerformance].sort((a, b) => b.avgImpressions - a.avgImpressions);
  if (sortedSlots.length >= 2) {
    const goldenSlot1 = sortedSlots[0];
    const goldenSlot2 = sortedSlots[1];

    weeklyPlan.push({
      timeSlot: goldenSlot1.label,
      postsPerDay: Math.ceil(avgPostsPerDay * 0.35),
      focus: 'メイン投稿（長文・構成重視）',
    });

    weeklyPlan.push({
      timeSlot: goldenSlot2.label,
      postsPerDay: Math.ceil(avgPostsPerDay * 0.25),
      focus: 'サブ投稿（中程度の長さ）',
    });

    // 残りの時間帯
    const remaining = avgPostsPerDay - Math.ceil(avgPostsPerDay * 0.6);
    if (remaining > 0 && sortedSlots.length > 2) {
      weeklyPlan.push({
        timeSlot: 'その他の時間帯',
        postsPerDay: remaining,
        focus: '補助的な投稿',
      });
    }
  }

  return {
    keyInsights,
    bestTimeSlot,
    bestDayOfWeek,
    topPostInsight,
    recommendations,
    teachingPoints,
    actionPlans,
    avoidItems,
    weeklyPlan,
  };
}

async function saveReport(report: MonthlyReportData) {
  await ensureReportTable();
  const client = createBigQueryClient(PROJECT_ID);

  // 既存レポートを削除
  await client.query({
    query: `DELETE FROM \`${PROJECT_ID}.${DATASET}.${REPORT_TABLE}\` WHERE report_id = '${report.reportId}'`,
  });

  // 新規レポートを保存 - JSON文字列を適切にエスケープ
  const reportJson = JSON.stringify(report)
    .replace(/\\/g, '\\\\')  // バックスラッシュをエスケープ
    .replace(/'/g, "\\'")    // シングルクォートをエスケープ
    .replace(/\n/g, '\\n')   // 改行をエスケープ
    .replace(/\r/g, '\\r')   // キャリッジリターンをエスケープ
    .replace(/\t/g, '\\t');  // タブをエスケープ

  const sql = `
    INSERT INTO \`${PROJECT_ID}.${DATASET}.${REPORT_TABLE}\`
    (report_id, report_type, period_year, period_month, start_date, end_date, report_data, created_at)
    VALUES
    ('${report.reportId}', '${report.reportType}', ${report.period.year}, ${report.period.month},
     '${report.period.startDate}', '${report.period.endDate}',
     PARSE_JSON('${reportJson}'), CURRENT_TIMESTAMP())
  `;

  await client.query({ query: sql });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { year, month, type } = body;

    if (type !== 'monthly') {
      return NextResponse.json({ error: '現在は月次レポートのみ対応しています' }, { status: 400 });
    }

    if (!year || !month) {
      return NextResponse.json({ error: 'year と month が必要です' }, { status: 400 });
    }

    console.log(`[report/generate] Generating monthly report for ${year}-${month}`);

    const report = await generateMonthlyReport(year, month);
    await saveReport(report);

    console.log(`[report/generate] Report saved: ${report.reportId}`);

    return NextResponse.json({ success: true, reportId: report.reportId, report });
  } catch (error) {
    console.error('[report/generate] Error:', error);
    return NextResponse.json(
      { error: 'レポート生成に失敗しました', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
