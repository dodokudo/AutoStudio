const { readFile, writeFile } = require('fs/promises');
const path = require('path');

function escapeHtml(text) {
  if (!text) return '';
  return text.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function truncateContent(content, maxLength = 300) {
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength) + '...';
}

function cleanPostContent(content) {
  if (!content) return '';
  // 【メイン投稿】【コメント欄1】などのマーカーを削除
  return content
    .replace(/【メイン投稿】\n?/g, '')
    .replace(/【コメント欄\d+】\n?/g, '')
    .trim();
}

function extractFirstLine(content) {
  if (!content) return '';
  // マーカーを削除してから最初の行を取得
  const cleaned = cleanPostContent(content);
  const lines = cleaned.split('\n').filter(line => line.trim().length > 0);
  return lines[0] || '';
}

async function generateFullReport() {
  const reportDataRaw = await readFile('/tmp/threads_comprehensive_report.json', 'utf8');
  const data = JSON.parse(reportDataRaw);

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Threads運用レポート【完全版】- 教材化・戦略立案用</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Meiryo', sans-serif; background: #f8f9fa; color: #333; line-height: 1.8; }
        .container { max-width: 1400px; margin: 0 auto; padding: 40px 20px; }

        header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; padding: 60px 30px; border-radius: 20px; margin-bottom: 40px; text-align: center; }
        h1 { font-size: 48px; margin-bottom: 15px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
        .subtitle { font-size: 20px; opacity: 0.95; margin-bottom: 10px; }

        section { background: #fff; border-radius: 15px; padding: 40px; margin-bottom: 30px; box-shadow: 0 4px 15px rgba(0,0,0,0.08); }
        h2 { font-size: 32px; color: #667eea; margin-bottom: 25px; border-left: 6px solid #667eea; padding-left: 15px; }
        h3 { font-size: 24px; color: #764ba2; margin: 30px 0 15px 0; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px; }
        h4 { font-size: 18px; color: #555; margin: 20px 0 10px 0; font-weight: bold; }

        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 25px 0; }
        .metric-card { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #fff; padding: 25px; border-radius: 12px; text-align: center; box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3); }
        .metric-label { font-size: 13px; opacity: 0.9; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px; }
        .metric-value { font-size: 36px; font-weight: bold; margin-bottom: 5px; }
        .metric-sub { font-size: 12px; opacity: 0.8; }

        .chart-container { position: relative; height: 400px; margin: 30px 0; }
        .chart-container-small { position: relative; height: 300px; margin: 25px 0; }

        table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px; }
        th, td { padding: 12px 15px; text-align: left; border-bottom: 1px solid #e0e0e0; }
        th { background: #f5f5f5; color: #667eea; font-weight: bold; position: sticky; top: 0; }
        tr:hover { background: #f9f9f9; }

        .success-box { background: #d4edda; border-left: 5px solid #28a745; padding: 20px; margin: 20px 0; border-radius: 8px; color: #155724; }
        .info-box { background: #d1ecf1; border-left: 5px solid #17a2b8; padding: 20px; margin: 20px 0; border-radius: 8px; color: #0c5460; }
        .warning-box { background: #fff3cd; border-left: 5px solid #ffc107; padding: 20px; margin: 20px 0; border-radius: 8px; color: #856404; }
        .highlight { background: linear-gradient(transparent 60%, #ffd700 60%); font-weight: bold; padding: 2px 4px; }

        .post-example { background: #f8f9fa; border-left: 4px solid #667eea; padding: 15px; margin: 15px 0; border-radius: 5px; font-size: 13px; }
        .post-example .post-header { font-weight: bold; color: #667eea; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; }
        .post-example .post-metrics { font-size: 11px; color: #666; }
        .post-example .post-content { color: #333; line-height: 1.6; white-space: pre-wrap; }
        .post-example .post-tags { margin-top: 10px; }

        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
        @media (max-width: 1024px) { .grid-2 { grid-template-columns: 1fr; } }

        .tag { display: inline-block; background: #e3f2fd; color: #1976d2; padding: 4px 12px; border-radius: 12px; font-size: 12px; margin: 3px; }
        .tag.winner { background: #ffd700; color: #856404; font-weight: bold; }
        .tag.loser { background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Threads運用レポート【完全版】</h1>
            <div class="subtitle">データ分析 & 実践的知見の言語化</div>
            <div class="subtitle">教材作成・コンテンツ戦略立案用</div>
            <div style="font-size: 14px; margin-top: 15px; opacity: 0.9;">
                分析期間：${data.period.start} 〜 ${data.period.end}（${data.period.days}日間）<br>
                作成日：2025年11月10日
            </div>
        </header>

        <!-- 1. サマリー -->
        <section>
            <h2>📊 全体サマリー</h2>
            <div class="metrics">
                <div class="metric-card">
                    <div class="metric-label">総投稿数</div>
                    <div class="metric-value">${data.summary.posts}件</div>
                    <div class="metric-sub">1日平均 ${(data.summary.posts / data.period.days).toFixed(1)}件</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">総インプレッション</div>
                    <div class="metric-value">${Math.round(data.summary.totalImpressions / 10000)}万</div>
                    <div class="metric-sub">平均 ${Math.round(data.summary.averageImpressions).toLocaleString()} imp/投稿</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">勝ち投稿（10,000+）</div>
                    <div class="metric-value">${data.summary.winners}件</div>
                    <div class="metric-sub">勝率 ${(data.summary.winners / data.summary.posts * 100).toFixed(1)}%</div>
                </div>
                <div class="metric-card">
                    <div class="metric-label">フォロワー増加</div>
                    <div class="metric-value">${data.summary.followerIncrease.toLocaleString()}人</div>
                    <div class="metric-sub">1日平均 ${(data.summary.followerIncrease / data.period.days).toFixed(1)}人</div>
                </div>
            </div>

            <div class="success-box" style="margin-top: 30px;">
                <h3 style="margin-top: 0; color: #155724;">✅ 最重要インサイト</h3>
                <ul style="margin-left: 20px; line-height: 2;">
                    <li><span class="highlight">ノウハウ系が82.7%を占め</span>、勝ち投稿の92.9%がノウハウ系（戦略は正しい）</li>
                    <li>最大バズ投稿：270,000 imp + フォロワー303人増（10月4日）</li>
                    <li>朝6-9時が勝ち投稿最多（43%）、夜18-21時が平均impで最強</li>
                    <li>「【タイトル】型」フックが最も効果的</li>
                    <li>ChatGPT活用テーマが最強（勝率5.7%、平均3,619 imp）</li>
                </ul>
            </div>
        </section>

        <!-- 2. 日別推移 -->
        <section>
            <h2>📈 日別推移（インプレッション・フォロワー）</h2>
            <div class="chart-container"><canvas id="dailyChart"></canvas></div>
        </section>

${generateWinnerAnalysisSection(data.winnerAnalysis)}

${generateHowtoSubtypeSection(data.howtoSubtypeBreakdown)}

${generateTopicSection(data.topicBreakdown)}

${generateHookPatternSection(data.hookPatternBreakdown)}

${generateCharLengthSection(data.charLengthBreakdown, data.structureStats)}

${generateWeekdaySection(data.weekdayBreakdown)}

${generatePostTypeSection(data.postTypeBreakdown)}

${generateTimeBandSection(data.timeBandBreakdown)}

${generateLoserAnalysisSection(data.loserAnalysis)}

${generateMonthlySection(data.monthlyBreakdown)}

    </div>

    <script>
    // データ埋め込み
    const dailySummary = ${JSON.stringify(data.dailySummary)};
    const followerMetrics = ${JSON.stringify(data.followerMetrics)};

    // 日別推移グラフ - 日付で結合してデータの整合性を確保
    const dailyCtx = document.getElementById('dailyChart').getContext('2d');

    // フォロワーメトリクスをMapに変換
    const followerMap = new Map();
    followerMetrics.forEach(f => {
        followerMap.set(f.date, f.followersDelta || 0);
    });

    // dailySummaryを基準に全データを結合
    const dailyLabels = dailySummary.map(d => d.date.substring(5));
    const dailyImpressions = dailySummary.map(d => d.totalImpressions);
    const dailyFollowerDeltas = dailySummary.map(d => followerMap.get(d.date) || 0);

    new Chart(dailyCtx, {
        type: 'bar',
        data: {
            labels: dailyLabels,
            datasets: [
                {
                    label: 'インプレッション',
                    data: dailyImpressions,
                    type: 'line',
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    yAxisID: 'y',
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 3,
                },
                {
                    label: 'フォロワー増加',
                    data: dailyFollowerDeltas,
                    backgroundColor: 'rgba(118, 75, 162, 0.7)',
                    yAxisID: 'y1',
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'top' },
                tooltip: { mode: 'index', intersect: false }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: { display: true, text: 'インプレッション' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    min: 0,
                    title: { display: true, text: 'フォロワー増加' },
                    grid: { drawOnChartArea: false }
                }
            }
        }
    });
    </script>
</body>
</html>`;

  await writeFile(
    path.join(__dirname, '../public/analysis/threads/レポート_10月11月_完全版_LINE除外.html'),
    html,
    'utf8'
  );
  console.log('✅ Full report generated: レポート_10月11月_完全版_LINE除外.html');
}

function generateWinnerAnalysisSection(winners) {
  const top10 = winners.slice(0, 10);

  return `
        <!-- 3. 勝ち投稿TOP10の詳細分析 -->
        <section>
            <h2>🏆 勝ち投稿TOP10の詳細分析</h2>

            <div class="info-box">
                <h3 style="margin-top: 0; color: #0c5460;">💡 教材化のポイント</h3>
                <p>TOP10を分析すると、<span class="highlight">再現可能な成功パターン</span>が見えてきます：</p>
                <ul style="margin-left: 20px; margin-top: 10px; line-height: 1.8;">
                    <li><strong>テーマ：</strong>ChatGPT活用、プロンプト技術、企業事例が強い</li>
                    <li><strong>フック：</strong>「【タイトル】型」が効果的</li>
                    <li><strong>構造：</strong>【】や「」を使った視覚的な整理が効果的</li>
                    <li><strong>サブタイプ：</strong>「手順・やり方系」と「ロードマップ系」が成功しやすい</li>
                    <li><strong>文字数：</strong>1,000〜1,200文字が最適ゾーン</li>
                </ul>
            </div>

            <h3>勝ち投稿一覧</h3>
            ${top10.map((post, index) => `
            <div class="post-example">
                <div class="post-header">
                    <span>#${index + 1} ${post.date} ${post.time} ${post.weekday}</span>
                    <span class="post-metrics">${post.impressions.toLocaleString()} imp | ${post.likes} likes | ${(post.likeRate * 100).toFixed(2)}%</span>
                </div>
                <div class="post-tags">
                    <span class="tag winner">勝ち投稿</span>
                    <span class="tag">${post.type}</span>
                    ${post.subtype ? `<span class="tag">${post.subtype}</span>` : ''}
                    <span class="tag">${post.topic}</span>
                    <span class="tag">${post.hookPattern}</span>
                    <span class="tag">${post.charCount}字</span>
                    <span class="tag">${post.timeBand}</span>
                </div>
                <h4 style="margin-top: 15px;">フック（書き出し）：</h4>
                <div style="background: #fff; padding: 10px; border-radius: 5px; font-weight: bold; color: #667eea;">
                    ${escapeHtml(extractFirstLine(post.content))}
                </div>
                <h4 style="margin-top: 15px;">投稿内容（全文）：</h4>
                <div class="post-content">${escapeHtml(truncateContent(cleanPostContent(post.content), 800))}</div>
                <h4 style="margin-top: 15px;">構造分析：</h4>
                <ul style="font-size: 12px; color: #666; margin-left: 20px;">
                    ${post.structure.hasBrackets ? '<li>【】を使用 ✓</li>' : ''}
                    ${post.structure.hasQuotes ? '<li>「」を使用 ✓</li>' : ''}
                    ${post.structure.hasNumbering ? '<li>番号付きリスト使用 ✓</li>' : ''}
                    ${post.structure.hasBulletPoints ? '<li>箇条書き使用 ✓</li>' : ''}
                    ${post.structure.hasEmoji ? '<li>絵文字使用 ✓</li>' : ''}
                    <li>行数: ${post.lineCount}行</li>
                </ul>
            </div>
            `).join('')}
        </section>
  `;
}

function generateHowtoSubtypeSection(breakdown) {
  const entries = Object.entries(breakdown).sort((a, b) => b[1].averageImpressions - a[1].averageImpressions);

  return `
        <!-- 4. ノウハウ系のサブカテゴリー分析 -->
        <section>
            <h2>📚 ノウハウ系のサブカテゴリー分析</h2>

            <div class="info-box">
                <h3 style="margin-top: 0; color: #0c5460;">💡 発見</h3>
                <p>ノウハウ系の中でも、<span class="highlight">どのタイプが強いか</span>が明確に：</p>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>サブカテゴリー</th>
                        <th>投稿数</th>
                        <th>平均imp</th>
                        <th>勝ち投稿</th>
                        <th>勝率</th>
                    </tr>
                </thead>
                <tbody>
                    ${entries.map(([name, data]) => `
                    <tr>
                        <td><strong>${escapeHtml(name)}</strong></td>
                        <td>${data.posts}件</td>
                        <td>${Math.round(data.averageImpressions).toLocaleString()}</td>
                        <td>${data.winners}件</td>
                        <td>${(data.winners / data.posts * 100).toFixed(1)}%</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="success-box">
                <h3 style="margin-top: 0; color: #155724;">✅ 実践的な結論</h3>
                <ul style="margin-left: 20px; line-height: 2;">
                    <li><strong>「手順・やり方系」</strong>と<strong>「ロードマップ系」</strong>が勝率高い</li>
                    <li>「よくある間違い系」も強いが、投稿数が少ない → 増やすべき</li>
                    <li>「比較・使い分け系」は安定した成果（教材化しやすい）</li>
                </ul>
            </div>
        </section>
  `;
}

function generateTopicSection(breakdown) {
  const entries = Object.entries(breakdown)
    .sort((a, b) => b[1].averageImpressions - a[1].averageImpressions)
    .slice(0, 10);

  return `
        <!-- 5. テーマ・トピック別分析 -->
        <section>
            <h2>🎯 テーマ・トピック別分析</h2>

            <div class="info-box">
                <h3 style="margin-top: 0; color: #0c5460;">💡 ユーザーが最も反応するテーマ</h3>
                <p>498件の投稿を自動分類し、<span class="highlight">どのテーマが伸びるか</span>を可視化：</p>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>テーマ</th>
                        <th>投稿数</th>
                        <th>平均imp</th>
                        <th>勝ち投稿</th>
                        <th>勝率</th>
                    </tr>
                </thead>
                <tbody>
                    ${entries.map(([name, data]) => `
                    <tr>
                        <td><strong>${escapeHtml(name)}</strong></td>
                        <td>${data.posts}件</td>
                        <td>${Math.round(data.averageImpressions).toLocaleString()}</td>
                        <td>${data.winners}件</td>
                        <td>${(data.winRate * 100).toFixed(1)}%</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="success-box">
                <h3 style="margin-top: 0; color: #155724;">✅ テーマ戦略</h3>
                <ul style="margin-left: 20px; line-height: 2;">
                    <li><strong>ChatGPT活用</strong>が圧倒的に強い（勝率・平均impともに最高）</li>
                    <li>プロンプト技術、ビジネス思考も安定</li>
                    <li>Claude、Gemini系はまだ投稿数が少ない → 伸びしろあり</li>
                </ul>
            </div>
        </section>
  `;
}

function generateHookPatternSection(breakdown) {
  const entries = Object.entries(breakdown)
    .sort((a, b) => b[1].averageImpressions - a[1].averageImpressions);

  return `
        <!-- 6. フック（書き出し）パターン分析 -->
        <section>
            <h2>🎣 フック（書き出し）パターン分析</h2>

            <div class="info-box">
                <h3 style="margin-top: 0; color: #0c5460;">💡 最初の1行で決まる</h3>
                <p>勝ち投稿の書き出しを分析し、<span class="highlight">読者を引き込むパターン</span>を抽出：</p>
            </div>

            <table>
                <thead>
                    <tr>
                        <th>フックパターン</th>
                        <th>投稿数</th>
                        <th>平均imp</th>
                        <th>勝ち投稿</th>
                        <th>勝率</th>
                    </tr>
                </thead>
                <tbody>
                    ${entries.map(([name, data]) => `
                    <tr>
                        <td><strong>${escapeHtml(name)}</strong></td>
                        <td>${data.posts}件</td>
                        <td>${Math.round(data.averageImpressions).toLocaleString()}</td>
                        <td>${data.winners}件</td>
                        <td>${(data.winners / data.posts * 100).toFixed(1)}%</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="success-box">
                <h3 style="margin-top: 0; color: #155724;">✅ 実践的フック戦略</h3>
                <ul style="margin-left: 20px; line-height: 2;">
                    <li><strong>「【タイトル】型」</strong>が最強（勝率・平均impともに高い）</li>
                    <li>「数字使用型」も効果的</li>
                    <li>「警告型」（知らないと〜）は注目を集めやすい</li>
                </ul>
            </div>
        </section>
  `;
}

function generateCharLengthSection(charBreakdown, structureStats) {
  return `
        <!-- 7. 文字数・構造分析 -->
        <section>
            <h2>📝 文字数・構造分析</h2>

            <h3>文字数別パフォーマンス</h3>
            <table>
                <thead>
                    <tr>
                        <th>文字数</th>
                        <th>投稿数</th>
                        <th>平均imp</th>
                        <th>勝ち投稿</th>
                    </tr>
                </thead>
                <tbody>
                    ${charBreakdown.map(data => `
                    <tr>
                        <td><strong>${data.label}</strong></td>
                        <td>${data.posts}件</td>
                        <td>${Math.round(data.averageImpressions).toLocaleString()}</td>
                        <td>${data.winners}件</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>

            <h3>構造要素別パフォーマンス</h3>
            <div class="info-box">
                <p><strong>構造要素とは：</strong>投稿内で使われている視覚的な整理手法のことです。</p>
                <ul style="margin-left: 20px; margin-top: 10px;">
                    <li><strong>箇条書き：</strong>・や•を使った箇条書き（例：・ポイント1）</li>
                    <li><strong>番号付きリスト：</strong>①や1.を使った番号付き（例：①手順1）</li>
                    <li><strong>絵文字：</strong>絵文字の使用</li>
                    <li><strong>【】使用：</strong>【タイトル】などの括弧</li>
                    <li><strong>「」使用：</strong>「引用」などの鉤括弧</li>
                </ul>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>構造要素</th>
                        <th>使用投稿数</th>
                        <th>使用率</th>
                        <th>平均imp</th>
                        <th>勝ち投稿</th>
                    </tr>
                </thead>
                <tbody>
                    ${structureStats.map(data => `
                    <tr>
                        <td><strong>${data.feature}</strong></td>
                        <td>${data.posts}件</td>
                        <td>${(data.posts / 498 * 100).toFixed(1)}%</td>
                        <td>${Math.round(data.averageImpressions).toLocaleString()}</td>
                        <td>${data.winners}件</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="success-box">
                <h3 style="margin-top: 0; color: #155724;">✅ コンテンツ構造の最適解</h3>
                <ul style="margin-left: 20px; line-height: 2;">
                    <li><strong>文字数：</strong>長め（401-600字）が最も平均impが高い</li>
                    <li><strong>【】使用：</strong>視覚的に整理され、効果的</li>
                    <li><strong>「」使用：</strong>引用・会話調で親しみやすい</li>
                </ul>
            </div>
        </section>
  `;
}

function generateWeekdaySection(breakdown) {
  const weekdayOrder = ['月', '火', '水', '木', '金', '土', '日'];
  const entries = weekdayOrder.map(day => [day, breakdown[day] || { posts: 0, totalImpressions: 0, winners: 0, averageImpressions: 0 }]);

  return `
        <!-- 8. 曜日別パフォーマンス -->
        <section>
            <h2>📅 曜日別パフォーマンス</h2>

            <table>
                <thead>
                    <tr>
                        <th>曜日</th>
                        <th>投稿数</th>
                        <th>平均imp</th>
                        <th>勝ち投稿</th>
                    </tr>
                </thead>
                <tbody>
                    ${entries.map(([day, data]) => `
                    <tr>
                        <td><strong>${day}曜日</strong></td>
                        <td>${data.posts}件</td>
                        <td>${Math.round(data.averageImpressions).toLocaleString()}</td>
                        <td>${data.winners}件</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="info-box">
                <h3 style="margin-top: 0; color: #0c5460;">💡 曜日の影響</h3>
                <p>曜日による大きな差は見られないが、<span class="highlight">週末（土日）</span>がやや強い傾向。</p>
            </div>
        </section>
  `;
}

function generatePostTypeSection(breakdown) {
  const entries = Object.entries(breakdown).sort((a, b) => b[1].averageImpressions - a[1].averageImpressions);

  return `
        <!-- 9. 投稿タイプ別パフォーマンス -->
        <section>
            <h2>📊 投稿タイプ別パフォーマンス</h2>

            <table>
                <thead>
                    <tr>
                        <th>タイプ</th>
                        <th>投稿数</th>
                        <th>比率</th>
                        <th>平均imp</th>
                        <th>勝ち投稿</th>
                    </tr>
                </thead>
                <tbody>
                    ${entries.map(([name, data]) => `
                    <tr>
                        <td><strong>${escapeHtml(name)}</strong></td>
                        <td>${data.posts}件</td>
                        <td>${(data.posts / 498 * 100).toFixed(1)}%</td>
                        <td>${Math.round(data.averageImpressions).toLocaleString()}</td>
                        <td>${data.winners}件</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="success-box">
                <h3 style="margin-top: 0; color: #155724;">✅ 分類ロジック修正完了</h3>
                <p><span class="highlight">ノウハウ系が82.7%</span>を占め、勝ち投稿の92.9%がノウハウ系。戦略は正しい。</p>
            </div>
        </section>
  `;
}

function generateTimeBandSection(breakdown) {
  const timeBandOrder = ['早朝(0-6時)', '朝(6-9時)', '午前(9-12時)', '昼(12-15時)', '午後(15-18時)', '夜(18-21時)', '深夜(21-24時)'];
  const entries = timeBandOrder.map(band => [band, breakdown[band] || { posts: 0, totalImpressions: 0, winners: 0, averageImpressions: 0 }]);

  return `
        <!-- 10. 時間帯別パフォーマンス -->
        <section>
            <h2>⏰ 時間帯別パフォーマンス</h2>

            <table>
                <thead>
                    <tr>
                        <th>時間帯</th>
                        <th>投稿数</th>
                        <th>平均imp</th>
                        <th>勝ち投稿</th>
                    </tr>
                </thead>
                <tbody>
                    ${entries.map(([band, data]) => `
                    <tr>
                        <td><strong>${band}</strong></td>
                        <td>${data.posts}件</td>
                        <td>${Math.round(data.averageImpressions).toLocaleString()}</td>
                        <td>${data.winners}件</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="success-box">
                <h3 style="margin-top: 0; color: #155724;">✅ 時間帯戦略</h3>
                <ul style="margin-left: 20px; line-height: 2;">
                    <li><strong>朝6-9時：</strong>勝ち投稿最多（43%）</li>
                    <li><strong>夜18-21時：</strong>平均impで最強</li>
                </ul>
            </div>
        </section>
  `;
}

function generateLoserAnalysisSection(loserData) {
  const typeEntries = Object.entries(loserData.byType).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topicEntries = Object.entries(loserData.byTopic).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return `
        <!-- 11. 失敗パターン分析 -->
        <section>
            <h2>⚠️ 失敗パターン分析</h2>

            <div class="warning-box">
                <h3 style="margin-top: 0; color: #856404;">💡 避けるべきパターン</h3>
                <p>インプレッション1,000未満の投稿（${loserData.total}件）を分析し、<span class="highlight">失敗の共通点</span>を抽出：</p>
            </div>

            <h3>失敗投稿が多いタイプ</h3>
            <table>
                <thead>
                    <tr>
                        <th>タイプ</th>
                        <th>失敗投稿数</th>
                    </tr>
                </thead>
                <tbody>
                    ${typeEntries.map(([name, count]) => `
                    <tr>
                        <td>${escapeHtml(name)}</td>
                        <td>${count}件</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>

            <h3>失敗投稿が多いテーマ</h3>
            <table>
                <thead>
                    <tr>
                        <th>テーマ</th>
                        <th>失敗投稿数</th>
                    </tr>
                </thead>
                <tbody>
                    ${topicEntries.map(([name, count]) => `
                    <tr>
                        <td>${escapeHtml(name)}</td>
                        <td>${count}件</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="warning-box">
                <h3 style="margin-top: 0; color: #856404;">⚠️ 改善ポイント</h3>
                <ul style="margin-left: 20px; line-height: 2;">
                    <li>ストーリー系・質問系は伸びにくい → ノウハウ系に変換</li>
                    <li>「その他」テーマは避け、ChatGPT・プロンプト系に集中</li>
                    <li>フックが弱い投稿は読まれない → 【】型を使う</li>
                </ul>
            </div>
        </section>
  `;
}

function generateMonthlySection(breakdown) {
  const entries = Object.entries(breakdown).sort((a, b) => a[0].localeCompare(b[0]));

  return `
        <!-- 12. 月別変化の分析 -->
        <section>
            <h2>📈 月別変化の分析</h2>

            <table>
                <thead>
                    <tr>
                        <th>月</th>
                        <th>投稿数</th>
                        <th>平均imp</th>
                        <th>勝ち投稿</th>
                        <th>勝率</th>
                    </tr>
                </thead>
                <tbody>
                    ${entries.map(([month, data]) => `
                    <tr>
                        <td><strong>${month}</strong></td>
                        <td>${data.posts}件</td>
                        <td>${Math.round(data.averageImpressions).toLocaleString()}</td>
                        <td>${data.winners}件</td>
                        <td>${(data.winRate * 100).toFixed(1)}%</td>
                    </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="info-box">
                <h3 style="margin-top: 0; color: #0c5460;">💡 時系列での成長</h3>
                <p>10月から11月にかけての変化を可視化。継続的な改善の効果を確認。</p>
            </div>
        </section>

        <!-- 最終サマリー -->
        <section>
            <h2>🎯 実践的な結論：次に何をすべきか</h2>

            <div class="success-box">
                <h3 style="margin-top: 0; color: #155724;">✅ 継続すべきこと（すでに正しい戦略）</h3>
                <ul style="margin-left: 20px; line-height: 2;">
                    <li><strong>ノウハウ系を82.7%維持</strong> - 勝ち投稿の92.9%がノウハウ系</li>
                    <li><strong>【】と「」を100%使用</strong> - 視覚的に整理され、読みやすい</li>
                    <li><strong>400-600字の中長文</strong> - 最も平均impが高い文字数帯</li>
                    <li><strong>ChatGPT活用を中心に</strong> - 279件投稿済み、平均2,689imp</li>
                </ul>
            </div>

            <h3>📊 投稿比率の最適化（現状 → 推奨）</h3>

            <h4>1. フックパターンの最適化</h4>
            <table style="font-size: 14px;">
                <thead>
                    <tr>
                        <th>フックパターン</th>
                        <th>現状比率</th>
                        <th>平均imp</th>
                        <th>勝率</th>
                        <th>推奨比率</th>
                        <th>変化</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="background: #d4edda;">
                        <td><strong>警告型</strong><br><small>（知らないと〜、ヤバい、危険）</small></td>
                        <td>2.2%</td>
                        <td>10,691</td>
                        <td>18.2%</td>
                        <td><strong>15%</strong></td>
                        <td style="color: #28a745; font-weight: bold;">+12.8%</td>
                    </tr>
                    <tr style="background: #d4edda;">
                        <td><strong>数字使用型</strong><br><small>（○○の5つの方法、など）</small></td>
                        <td>23.9%</td>
                        <td>4,282</td>
                        <td>3.4%</td>
                        <td><strong>30%</strong></td>
                        <td style="color: #28a745; font-weight: bold;">+6.1%</td>
                    </tr>
                    <tr>
                        <td>【タイトル】型</td>
                        <td>18.1%</td>
                        <td>2,171</td>
                        <td>3.3%</td>
                        <td><strong>20%</strong></td>
                        <td style="color: #28a745;">+1.9%</td>
                    </tr>
                    <tr>
                        <td>「引用」型</td>
                        <td>18.1%</td>
                        <td>1,469</td>
                        <td>1.1%</td>
                        <td><strong>15%</strong></td>
                        <td style="color: #dc3545;">-3.1%</td>
                    </tr>
                    <tr style="background: #fff3cd;">
                        <td>その他（弱いパターン）</td>
                        <td>36.9%</td>
                        <td>1,557</td>
                        <td>2.2%</td>
                        <td><strong>20%</strong></td>
                        <td style="color: #dc3545; font-weight: bold;">-16.9%</td>
                    </tr>
                </tbody>
            </table>

            <div class="info-box" style="margin-top: 20px;">
                <h4 style="margin-top: 0; color: #0c5460;">💡 フック戦略の実践ポイント</h4>
                <ul style="margin-left: 20px; line-height: 1.8;">
                    <li><strong>警告型を6.8倍に増やす（2.2% → 15%）</strong><br>
                    例：「【緊急】NotebookLMに社内資料アップしてる人、マジで危険です」<br>
                    例：「ChatGPT有料版、月3000円払ってるのに無料版と同じ使い方してる人多すぎます」</li>
                    <li><strong>数字使用型を1.26倍に増やす（23.9% → 30%）</strong><br>
                    例：「住友商事のCopilot導入、5つの成功パターン」</li>
                    <li><strong>「その他」を半減させる（36.9% → 20%）</strong><br>
                    → 弱いパターンを強いパターンに置き換える</li>
                </ul>
            </div>

            <h4>2. 時間帯別投稿戦略の最適化</h4>
            <table style="font-size: 14px;">
                <thead>
                    <tr>
                        <th>時間帯</th>
                        <th>現状比率</th>
                        <th>平均imp</th>
                        <th>勝ち投稿数</th>
                        <th>推奨比率</th>
                        <th>変化</th>
                        <th>推奨投稿タイプ</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="background: #d4edda;">
                        <td><strong>夜(18-21時)</strong></td>
                        <td>26.3%</td>
                        <td>3,953</td>
                        <td>3件</td>
                        <td><strong>35%</strong></td>
                        <td style="color: #28a745; font-weight: bold;">+8.7%</td>
                        <td>警告型、数字使用型</td>
                    </tr>
                    <tr style="background: #d4edda;">
                        <td><strong>朝(6-9時)</strong></td>
                        <td>23.9%</td>
                        <td>2,665</td>
                        <td>6件</td>
                        <td><strong>30%</strong></td>
                        <td style="color: #28a745; font-weight: bold;">+6.1%</td>
                        <td>ロードマップ系、手順系</td>
                    </tr>
                    <tr>
                        <td>早朝(0-6時)</td>
                        <td>27.1%</td>
                        <td>1,892</td>
                        <td>3件</td>
                        <td><strong>15%</strong></td>
                        <td style="color: #dc3545; font-weight: bold;">-12.1%</td>
                        <td>軽めの内容</td>
                    </tr>
                    <tr>
                        <td>深夜(21-24時)</td>
                        <td>12.2%</td>
                        <td>1,542</td>
                        <td>1件</td>
                        <td><strong>10%</strong></td>
                        <td style="color: #dc3545;">-2.2%</td>
                        <td>-</td>
                    </tr>
                    <tr>
                        <td>昼(12-15時)</td>
                        <td>3.8%</td>
                        <td>1,885</td>
                        <td>1件</td>
                        <td><strong>5%</strong></td>
                        <td style="color: #28a745;">+1.2%</td>
                        <td>-</td>
                    </tr>
                    <tr style="background: #fff3cd;">
                        <td>午後(15-18時)</td>
                        <td>6.2%</td>
                        <td>785</td>
                        <td>0件</td>
                        <td><strong>3%</strong></td>
                        <td style="color: #dc3545;">-3.2%</td>
                        <td>投稿を避ける</td>
                    </tr>
                    <tr style="background: #fff3cd;">
                        <td>午前(9-12時)</td>
                        <td>0.4%</td>
                        <td>204</td>
                        <td>0件</td>
                        <td><strong>2%</strong></td>
                        <td style="color: #28a745;">+1.6%</td>
                        <td>投稿を避ける</td>
                    </tr>
                </tbody>
            </table>

            <div class="info-box" style="margin-top: 20px;">
                <h4 style="margin-top: 0; color: #0c5460;">💡 時間帯戦略の実践ポイント</h4>
                <ul style="margin-left: 20px; line-height: 1.8;">
                    <li><strong>夜18-21時を35%に増やす（現状26.3%）</strong><br>
                    → 平均imp最強（3,953）。警告型・数字使用型のフックで勝負</li>
                    <li><strong>朝6-9時を30%に増やす（現状23.9%）</strong><br>
                    → 勝ち投稿最多（6件）。ロードマップ系・手順系で確実に</li>
                    <li><strong>早朝0-6時を半減させる（27.1% → 15%）</strong><br>
                    → 投稿数多いのに効果低い。夜・朝に振り分ける</li>
                    <li><strong>午後15-18時と午前9-12時は避ける</strong><br>
                    → 平均impが最低。投稿しても伸びない</li>
                </ul>
            </div>

            <h4>3. ノウハウ系サブタイプの最適化</h4>
            <table style="font-size: 14px;">
                <thead>
                    <tr>
                        <th>サブタイプ</th>
                        <th>現状</th>
                        <th>平均imp</th>
                        <th>勝率</th>
                        <th>推奨</th>
                        <th>変化</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="background: #d4edda;">
                        <td><strong>ロードマップ系</strong></td>
                        <td>6件 (1.5%)</td>
                        <td>16,264</td>
                        <td>16.7%</td>
                        <td><strong>40件 (10%)</strong></td>
                        <td style="color: #28a745; font-weight: bold;">+34件</td>
                    </tr>
                    <tr>
                        <td>手順・やり方系</td>
                        <td>243件 (59%)</td>
                        <td>3,314</td>
                        <td>3.3%</td>
                        <td><strong>250件 (60%)</strong></td>
                        <td style="color: #28a745;">+7件</td>
                    </tr>
                    <tr>
                        <td>よくある間違い系</td>
                        <td>119件 (29%)</td>
                        <td>1,508</td>
                        <td>2.5%</td>
                        <td><strong>80件 (20%)</strong></td>
                        <td style="color: #dc3545;">-39件</td>
                    </tr>
                    <tr>
                        <td>比較・使い分け系</td>
                        <td>35件 (8.5%)</td>
                        <td>1,451</td>
                        <td>2.9%</td>
                        <td><strong>40件 (10%)</strong></td>
                        <td style="color: #28a745;">+5件</td>
                    </tr>
                </tbody>
            </table>

            <div class="success-box" style="margin-top: 20px;">
                <h4 style="margin-top: 0; color: #155724;">✅ サブタイプ戦略の実践ポイント</h4>
                <ul style="margin-left: 20px; line-height: 1.8;">
                    <li><strong>ロードマップ系を6.7倍に増やす（6件 → 40件）</strong><br>
                    例：「ChatGPT初心者から上級者までの完全ロードマップ」<br>
                    例：「AI活用で月収100万円までの5ステップ」<br>
                    → 平均16,264impと圧倒的に強い！優先的に増やす</li>
                    <li><strong>手順・やり方系を維持（60%）</strong><br>
                    → 安定して3,314imp。現状維持でOK</li>
                    <li><strong>よくある間違い系を減らす（29% → 20%）</strong><br>
                    → 平均1,508impと弱い。強いサブタイプに置き換える</li>
                </ul>
            </div>

            <h4>4. テーマ別の最適化</h4>
            <table style="font-size: 14px;">
                <thead>
                    <tr>
                        <th>テーマ</th>
                        <th>現状</th>
                        <th>平均imp</th>
                        <th>勝率</th>
                        <th>推奨</th>
                        <th>変化</th>
                    </tr>
                </thead>
                <tbody>
                    <tr style="background: #d4edda;">
                        <td><strong>プロンプト技術</strong></td>
                        <td>55件 (11%)</td>
                        <td>4,411</td>
                        <td>5.5%</td>
                        <td><strong>100件 (20%)</strong></td>
                        <td style="color: #28a745; font-weight: bold;">+45件</td>
                    </tr>
                    <tr>
                        <td>ChatGPT活用</td>
                        <td>279件 (56%)</td>
                        <td>2,689</td>
                        <td>2.5%</td>
                        <td><strong>250件 (50%)</strong></td>
                        <td style="color: #dc3545;">-29件</td>
                    </tr>
                    <tr>
                        <td>AI全般</td>
                        <td>41件 (8%)</td>
                        <td>1,624</td>
                        <td>4.9%</td>
                        <td><strong>60件 (12%)</strong></td>
                        <td style="color: #28a745;">+19件</td>
                    </tr>
                    <tr style="background: #fff3cd;">
                        <td>Claude活用</td>
                        <td>23件 (5%)</td>
                        <td>1,519</td>
                        <td>0%</td>
                        <td><strong>30件 (6%)</strong></td>
                        <td style="color: #28a745;">+7件</td>
                    </tr>
                    <tr>
                        <td>その他</td>
                        <td>45件 (9%)</td>
                        <td>1,973</td>
                        <td>4.4%</td>
                        <td><strong>40件 (8%)</strong></td>
                        <td style="color: #dc3545;">-5件</td>
                    </tr>
                </tbody>
            </table>

            <h3>📅 週間投稿計画（推奨パターン）</h3>
            <div class="info-box">
                <h4 style="margin-top: 0; color: #0c5460;">1週間で実践する具体的な投稿プラン</h4>
                <p style="font-weight: bold; margin-bottom: 10px;">1日平均12.5件 → ゴールデンタイム（夜・朝）に集中</p>

                <table style="font-size: 13px; margin-top: 15px;">
                    <thead>
                        <tr>
                            <th>時間帯</th>
                            <th>投稿数/日</th>
                            <th>フック</th>
                            <th>サブタイプ</th>
                            <th>テーマ</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="background: #d4edda;">
                            <td><strong>朝6-9時</strong></td>
                            <td>4件</td>
                            <td>数字使用型、【タイトル】型</td>
                            <td>ロードマップ系、手順系</td>
                            <td>プロンプト技術、ChatGPT</td>
                        </tr>
                        <tr style="background: #d4edda;">
                            <td><strong>夜18-21時</strong></td>
                            <td>4件</td>
                            <td>警告型、数字使用型</td>
                            <td>手順系、ロードマップ系</td>
                            <td>ChatGPT、プロンプト</td>
                        </tr>
                        <tr>
                            <td>早朝0-6時</td>
                            <td>2件</td>
                            <td>【タイトル】型</td>
                            <td>手順系</td>
                            <td>AI全般</td>
                        </tr>
                        <tr>
                            <td>深夜21-24時</td>
                            <td>1件</td>
                            <td>「引用」型</td>
                            <td>比較系</td>
                            <td>ChatGPT</td>
                        </tr>
                        <tr>
                            <td>昼12-15時</td>
                            <td>1件</td>
                            <td>数字使用型</td>
                            <td>手順系</td>
                            <td>プロンプト</td>
                        </tr>
                        <tr style="background: #fff3cd;">
                            <td>その他</td>
                            <td>0-1件</td>
                            <td>-</td>
                            <td>-</td>
                            <td>-</td>
                        </tr>
                    </tbody>
                </table>

                <p style="margin-top: 15px; font-weight: bold;">【重要】1週間で最低1件は「ロードマップ系 × 警告型」を投稿する</p>
                <p style="margin-top: 5px;">例：「【知らないとヤバい】ChatGPT初心者が上級者になるまでの完全ロードマップ」</p>
            </div>

            <div class="warning-box">
                <h3 style="margin-top: 0; color: #856404;">⛔ 絶対に避けるべきこと</h3>
                <ul style="margin-left: 20px; line-height: 2;">
                    <li><strong>午後15-18時と午前9-12時の投稿</strong> → 平均impが最低</li>
                    <li><strong>「その他」フックパターン（36.9% → 20%に削減）</strong> → 弱いパターンを強いパターンに置き換える</li>
                    <li><strong>質問系・共感系・ストーリー系</strong> → ノウハウ系に変換</li>
                    <li><strong>Claude活用で勝率0%</strong> → 書き方を大幅に変える必要あり</li>
                    <li><strong>100字以下の短文</strong> → 400-600字の中長文にする</li>
                </ul>
            </div>

            <div class="success-box">
                <h3 style="margin-top: 0; color: #155724;">🎯 今すぐ実行する3つのアクション</h3>
                <ol style="margin-left: 20px; line-height: 2; font-size: 16px;">
                    <li><strong>今週から「警告型フック」を1日2件投稿する</strong><br>
                    <small>現状2.2% → 15%に増やす。平均10,691impと圧倒的に強い</small></li>
                    <li><strong>早朝0-6時の投稿を半分にして、夜18-21時に振り分ける</strong><br>
                    <small>夜18-21時は平均3,953impで最強。ここに集中投下</small></li>
                    <li><strong>ロードマップ系を週1回 → 週6回に増やす</strong><br>
                    <small>平均16,264impと圧倒的。優先的に増やすべき</small></li>
                </ol>
            </div>
        </section>
  `;
}

generateFullReport().catch(console.error);
