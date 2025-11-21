const { readFile, writeFile } = require('fs/promises');
const path = require('path');

async function prepareReportData() {
  console.log('Loading latest data...');

  const analysisDir = path.join(__dirname, '../analysis/threads');

  const aggregates = JSON.parse(await readFile(path.join(analysisDir, 'aggregates.json'), 'utf8'));
  const dailySummaryAll = JSON.parse(await readFile(path.join(analysisDir, 'daily_summary.json'), 'utf8'));
  const followersAll = JSON.parse(await readFile(path.join(analysisDir, 'followers.json'), 'utf8'));
  const posts = JSON.parse(await readFile(path.join(analysisDir, 'posts.json'), 'utf8'));

  // 10月以降のデータのみフィルタ
  const cutoffDate = '2025-10-01';
  const dailySummary = dailySummaryAll.filter(d => d.date >= cutoffDate);
  const followers = followersAll.filter(f => f.date >= cutoffDate);

  // 期間の計算
  const dates = dailySummary.map(d => d.date).sort();
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];
  const days = dates.length;

  // フォロワー増加数の計算
  const followerIncrease = followers.length > 0
    ? followers[followers.length - 1].followers - followers[0].followers
    : 0;

  // LINE登録数の計算
  const lineRegistrations = dailySummary.reduce((sum, day) => sum + (day.lineThreads || 0), 0);

  // 10月以降の投稿のみフィルタ
  const postsFiltered = posts.filter(p => p.dateJst >= cutoffDate);
  const winnersFiltered = (aggregates.winnerAnalysis || []).filter(w => w.date >= cutoffDate);

  // 10月以降の集計を再計算
  const totalImpressions = postsFiltered.reduce((sum, p) => sum + p.impressions, 0);
  const totalLikes = postsFiltered.reduce((sum, p) => sum + p.likes, 0);
  const winners = postsFiltered.filter(p => p.isWinner).length;

  // レポートデータの構築
  const reportData = {
    period: {
      start: startDate,
      end: endDate,
      days: days
    },
    summary: {
      posts: postsFiltered.length,
      totalImpressions: totalImpressions,
      averageImpressions: postsFiltered.length > 0 ? totalImpressions / postsFiltered.length : 0,
      winners: winners,
      followerIncrease: followerIncrease,
      lineRegistrations: lineRegistrations
    },
    dailySummary: dailySummary,
    followerMetrics: followers,
    winnerAnalysis: winnersFiltered,
    howtoSubtypeBreakdown: aggregates.howtoSubtypeBreakdown || {},
    topicBreakdown: aggregates.topicBreakdown || {},
    hookPatternBreakdown: aggregates.hookPatternBreakdown || {},
    charLengthBreakdown: aggregates.charLengthBreakdown || [],
    structureStats: aggregates.structureStats || [],
    weekdayBreakdown: aggregates.weekdayBreakdown || {},
    postTypeBreakdown: aggregates.postTypeBreakdown || {},
    timeBandBreakdown: aggregates.timeBandBreakdown || {},
    loserAnalysis: aggregates.loserAnalysis || { total: 0, byType: {}, byTopic: {} },
    monthlyBreakdown: aggregates.monthlyBreakdown || {}
  };

  // 出力
  await writeFile('/tmp/threads_comprehensive_report.json', JSON.stringify(reportData, null, 2), 'utf8');
  console.log('✅ Report data prepared: /tmp/threads_comprehensive_report.json');

  return reportData;
}

prepareReportData().catch(console.error);
