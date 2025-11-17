const { readFile, writeFile } = require('fs/promises');
const path = require('path');

async function filterReportData() {
  const START_DATE = '2025-10-01';
  const END_DATE = '2025-11-10';

  // データ読み込み
  const postsRaw = await readFile(path.join(__dirname, '../analysis/threads/posts.json'), 'utf8');
  const aggregatesRaw = await readFile(path.join(__dirname, '../analysis/threads/aggregates.json'), 'utf8');
  const dailyRaw = await readFile(path.join(__dirname, '../analysis/threads/daily_summary.json'), 'utf8');
  const followersRaw = await readFile(path.join(__dirname, '../analysis/threads/followers.json'), 'utf8');

  const allPosts = JSON.parse(postsRaw);
  const aggregates = JSON.parse(aggregatesRaw);
  const dailySummary = JSON.parse(dailyRaw);
  const followers = JSON.parse(followersRaw);

  // 期間フィルタ
  const posts = allPosts.filter((p) => p.dateJst >= START_DATE && p.dateJst <= END_DATE);
  const daily = dailySummary.filter((d) => d.date >= START_DATE && d.date <= END_DATE);
  const followerMetrics = followers.filter((f) => f.date >= START_DATE && f.date <= END_DATE);

  console.log(`Filtered posts: ${posts.length} (from ${allPosts.length})`);

  // 勝ち投稿のフィルタ
  const winners = posts.filter((p) => p.isWinner);

  // 勝ち投稿の詳細分析
  const winnerAnalysis = winners.map((post) => ({
    postId: post.postId,
    date: post.dateJst,
    time: post.timeJst,
    weekday: post.weekdayJst,
    timeBand: post.timeBand,
    impressions: post.impressions,
    likes: post.likes,
    likeRate: post.likeRate,
    type: post.type,
    subtype: post.subtype,
    topic: post.topic,
    hookPattern: post.hookPattern,
    charCount: post.charCount,
    lineCount: post.lineCount,
    structure: post.structure,
    firstLine: post.firstLine,
    content: post.content,
  })).sort((a, b) => b.impressions - a.impressions);

  // ノウハウ系サブカテゴリー別分析
  const howtoSubtypeBreakdown = {};
  const howtoPosts = posts.filter((p) => p.type === 'ノウハウ系');
  for (const post of howtoPosts) {
    const sub = post.subtype || 'その他ノウハウ';
    if (!howtoSubtypeBreakdown[sub]) {
      howtoSubtypeBreakdown[sub] = { posts: 0, totalImpressions: 0, winners: 0 };
    }
    howtoSubtypeBreakdown[sub].posts += 1;
    howtoSubtypeBreakdown[sub].totalImpressions += post.impressions;
    if (post.isWinner) howtoSubtypeBreakdown[sub].winners += 1;
  }
  for (const entry of Object.values(howtoSubtypeBreakdown)) {
    entry.averageImpressions = entry.posts > 0 ? entry.totalImpressions / entry.posts : 0;
  }

  // テーマ・トピック別分析
  const topicBreakdown = {};
  for (const post of posts) {
    const topic = post.topic || 'その他';
    if (!topicBreakdown[topic]) {
      topicBreakdown[topic] = { posts: 0, totalImpressions: 0, winners: 0 };
    }
    topicBreakdown[topic].posts += 1;
    topicBreakdown[topic].totalImpressions += post.impressions;
    if (post.isWinner) topicBreakdown[topic].winners += 1;
  }
  for (const entry of Object.values(topicBreakdown)) {
    entry.averageImpressions = entry.posts > 0 ? entry.totalImpressions / entry.posts : 0;
    entry.winRate = entry.posts > 0 ? entry.winners / entry.posts : 0;
  }

  // フックパターン別分析
  const hookPatternBreakdown = {};
  for (const post of posts) {
    const pattern = post.hookPattern || 'その他';
    if (!hookPatternBreakdown[pattern]) {
      hookPatternBreakdown[pattern] = { posts: 0, totalImpressions: 0, winners: 0 };
    }
    hookPatternBreakdown[pattern].posts += 1;
    hookPatternBreakdown[pattern].totalImpressions += post.impressions;
    if (post.isWinner) hookPatternBreakdown[pattern].winners += 1;
  }
  for (const entry of Object.values(hookPatternBreakdown)) {
    entry.averageImpressions = entry.posts > 0 ? entry.totalImpressions / entry.posts : 0;
  }

  // 曜日別分析
  const weekdayBreakdown = {};
  for (const post of posts) {
    const day = post.weekday || '不明';
    if (!weekdayBreakdown[day]) {
      weekdayBreakdown[day] = { posts: 0, totalImpressions: 0, winners: 0 };
    }
    weekdayBreakdown[day].posts += 1;
    weekdayBreakdown[day].totalImpressions += post.impressions;
    if (post.isWinner) weekdayBreakdown[day].winners += 1;
  }
  for (const entry of Object.values(weekdayBreakdown)) {
    entry.averageImpressions = entry.posts > 0 ? entry.totalImpressions / entry.posts : 0;
  }

  // 文字数分析
  const charRanges = [
    { label: '短文(1-100)', min: 1, max: 100 },
    { label: '短め(101-200)', min: 101, max: 200 },
    { label: '中(201-400)', min: 201, max: 400 },
    { label: '長め(401-600)', min: 401, max: 600 },
    { label: '長文(601+)', min: 601, max: 10000 },
  ];
  const charLengthBreakdown = charRanges.map((range) => {
    const filtered = posts.filter((p) => p.charCount >= range.min && p.charCount <= range.max);
    return {
      label: range.label,
      posts: filtered.length,
      averageImpressions: filtered.length > 0 ? filtered.reduce((sum, p) => sum + p.impressions, 0) / filtered.length : 0,
      winners: filtered.filter((p) => p.isWinner).length,
    };
  });

  // 構造分析
  const structureStats = [
    {
      feature: '箇条書き',
      posts: posts.filter((p) => p.structure.hasBulletPoints).length,
      averageImpressions: posts.filter((p) => p.structure.hasBulletPoints).reduce((sum, p) => sum + p.impressions, 0) / posts.filter((p) => p.structure.hasBulletPoints).length || 0,
      winners: posts.filter((p) => p.structure.hasBulletPoints && p.isWinner).length,
    },
    {
      feature: '番号付きリスト',
      posts: posts.filter((p) => p.structure.hasNumbering).length,
      averageImpressions: posts.filter((p) => p.structure.hasNumbering).reduce((sum, p) => sum + p.impressions, 0) / posts.filter((p) => p.structure.hasNumbering).length || 0,
      winners: posts.filter((p) => p.structure.hasNumbering && p.isWinner).length,
    },
    {
      feature: '絵文字使用',
      posts: posts.filter((p) => p.structure.hasEmoji).length,
      averageImpressions: posts.filter((p) => p.structure.hasEmoji).reduce((sum, p) => sum + p.impressions, 0) / posts.filter((p) => p.structure.hasEmoji).length || 0,
      winners: posts.filter((p) => p.structure.hasEmoji && p.isWinner).length,
    },
    {
      feature: '【】使用',
      posts: posts.filter((p) => p.structure.hasBrackets).length,
      averageImpressions: posts.filter((p) => p.structure.hasBrackets).reduce((sum, p) => sum + p.impressions, 0) / posts.filter((p) => p.structure.hasBrackets).length || 0,
      winners: posts.filter((p) => p.structure.hasBrackets && p.isWinner).length,
    },
    {
      feature: '「」使用',
      posts: posts.filter((p) => p.structure.hasQuotes).length,
      averageImpressions: posts.filter((p) => p.structure.hasQuotes).reduce((sum, p) => sum + p.impressions, 0) / posts.filter((p) => p.structure.hasQuotes).length || 0,
      winners: posts.filter((p) => p.structure.hasQuotes && p.isWinner).length,
    },
  ];

  // 投稿タイプ別
  const postTypeBreakdown = {};
  for (const post of posts) {
    if (!postTypeBreakdown[post.type]) {
      postTypeBreakdown[post.type] = { posts: 0, totalImpressions: 0, winners: 0 };
    }
    postTypeBreakdown[post.type].posts += 1;
    postTypeBreakdown[post.type].totalImpressions += post.impressions;
    if (post.isWinner) postTypeBreakdown[post.type].winners += 1;
  }
  for (const entry of Object.values(postTypeBreakdown)) {
    entry.averageImpressions = entry.posts > 0 ? entry.totalImpressions / entry.posts : 0;
  }

  // 時間帯別
  const timeBandBreakdown = {};
  for (const post of posts) {
    if (!timeBandBreakdown[post.timeBand]) {
      timeBandBreakdown[post.timeBand] = { posts: 0, totalImpressions: 0, winners: 0 };
    }
    timeBandBreakdown[post.timeBand].posts += 1;
    timeBandBreakdown[post.timeBand].totalImpressions += post.impressions;
    if (post.isWinner) timeBandBreakdown[post.timeBand].winners += 1;
  }
  for (const entry of Object.values(timeBandBreakdown)) {
    entry.averageImpressions = entry.posts > 0 ? entry.totalImpressions / entry.posts : 0;
  }

  // 失敗パターン分析
  const losers = posts.filter((p) => p.impressions < 1000);
  const loserAnalysis = {
    total: losers.length,
    byType: {},
    byTopic: {},
    byHookPattern: {},
  };
  for (const post of losers) {
    loserAnalysis.byType[post.type] = (loserAnalysis.byType[post.type] || 0) + 1;
    loserAnalysis.byTopic[post.topic] = (loserAnalysis.byTopic[post.topic] || 0) + 1;
    loserAnalysis.byHookPattern[post.hookPattern] = (loserAnalysis.byHookPattern[post.hookPattern] || 0) + 1;
  }

  // 月別分析
  const monthlyBreakdown = {};
  for (const post of posts) {
    const month = post.dateJst.substring(0, 7);
    if (!monthlyBreakdown[month]) {
      monthlyBreakdown[month] = { posts: 0, totalImpressions: 0, winners: 0 };
    }
    monthlyBreakdown[month].posts += 1;
    monthlyBreakdown[month].totalImpressions += post.impressions;
    if (post.isWinner) monthlyBreakdown[month].winners += 1;
  }
  for (const entry of Object.values(monthlyBreakdown)) {
    entry.averageImpressions = entry.posts > 0 ? entry.totalImpressions / entry.posts : 0;
    entry.winRate = entry.posts > 0 ? entry.winners / entry.posts : 0;
  }

  // フォロワー増加計算
  const firstFollowers = followerMetrics[0]?.followers || 0;
  const lastFollowers = followerMetrics[followerMetrics.length - 1]?.followers || 0;
  const totalFollowerIncrease = lastFollowers - firstFollowers;

  // LINE登録計算
  const totalLineRegistrations = daily.reduce((sum, d) => sum + d.lineThreads, 0);

  const report = {
    period: { start: START_DATE, end: END_DATE, days: daily.length },
    summary: {
      posts: posts.length,
      totalImpressions: posts.reduce((sum, p) => sum + p.impressions, 0),
      averageImpressions: posts.length > 0 ? posts.reduce((sum, p) => sum + p.impressions, 0) / posts.length : 0,
      winners: winners.length,
      followerIncrease: totalFollowerIncrease,
      lineRegistrations: totalLineRegistrations,
    },
    winnerAnalysis,
    howtoSubtypeBreakdown,
    topicBreakdown,
    hookPatternBreakdown,
    weekdayBreakdown,
    charLengthBreakdown,
    structureStats,
    postTypeBreakdown,
    timeBandBreakdown,
    loserAnalysis,
    monthlyBreakdown,
    dailySummary: daily,
    followerMetrics,
  };

  await writeFile('/tmp/threads_comprehensive_report.json', JSON.stringify(report, null, 2), 'utf8');
  console.log('Comprehensive report generated: /tmp/threads_comprehensive_report.json');
  console.log(`Period: ${START_DATE} to ${END_DATE}`);
  console.log(`Total posts: ${posts.length}`);
  console.log(`Winner posts: ${winners.length}`);
  console.log(`Follower increase: ${totalFollowerIncrease}`);
  console.log(`LINE registrations: ${totalLineRegistrations}`);
}

filterReportData().catch(console.error);
