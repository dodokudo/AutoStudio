#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');

const ACCOUNT_MAP = {
  monoguchi: '門口 拓也',
  sugi: 'すぎさん',
};
const LOOKBACK_DAYS = 30;

function formatNumber(value) {
  return Number(Math.round(value)).toLocaleString('ja-JP');
}

function formatPercent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatSignedNumber(value) {
  if (value > 0) {
    return `+${formatNumber(value)}`;
  }
  if (value < 0) {
    return formatNumber(value);
  }
  return '±0';
}

function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createPreview(text = '', limit = 120) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, limit)}…`;
}

function formatContent(text = '') {
  return escapeHtml(text).replace(/\r?\n/g, '<br />');
}

function computeDailyWithDelta(dailySummary) {
  return dailySummary.map((entry, index) => {
    const followers = typeof entry.followers === 'number' ? entry.followers : null;
    let delta = 0;
    if (followers !== null) {
      const prev = index > 0 ? dailySummary[index - 1] : null;
      const prevFollowers =
        prev && typeof prev.followers === 'number' ? prev.followers : followers;
      delta = followers - prevFollowers;
      if (!Number.isFinite(delta)) {
        delta = 0;
      }
    }
    return { ...entry, delta };
  });
}

function getPreviousDate(dateText) {
  if (!dateText) return null;
  const date = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function distributeDeltaAcrossPosts(posts, totalImpressions, delta) {
  if (!posts.length || !delta) return;
  if (totalImpressions > 0) {
    posts.forEach((post) => {
      const weight = post.impressions > 0 ? post.impressions / totalImpressions : 0;
      post.followerDelta += delta * weight;
    });
  } else {
    const share = delta / posts.length;
    posts.forEach((post) => {
      post.followerDelta += share;
    });
  }
}

function buildCombinedChart(dailySummary) {
  if (!dailySummary.length) {
    return '<p class="muted">データがありません。</p>';
  }

  const entries = dailySummary.map((entry, index) => {
    const impressions = entry.impressions || 0;
    let delta =
      typeof entry.delta === 'number' && Number.isFinite(entry.delta) ? entry.delta : null;
    const followers = typeof entry.followers === 'number' ? entry.followers : null;
    if (followers !== null) {
      if (delta === null) {
        const prev = index > 0 ? dailySummary[index - 1] : null;
        const prevFollowers =
          prev && typeof prev.followers === 'number' ? prev.followers : followers;
        delta = followers - prevFollowers;
      }
    }
    if (!Number.isFinite(delta)) {
      delta = 0;
    }
    return {
      date: entry.date,
      impressions,
      delta,
    };
  });

  const maxImpressions =
    entries.reduce((max, item) => (item.impressions > max ? item.impressions : max), 0) || 1;
  const maxGain = entries.reduce((max, item) => (item.delta > max ? item.delta : max), 0);
  const maxLoss = Math.abs(
    entries.reduce((min, item) => (item.delta < min ? item.delta : min), 0),
  );
  const hasNegative = maxLoss > 0;
  const hasPositive = maxGain > 0;
  const totalDeltaRange = (hasPositive ? maxGain : 0) + (hasNegative ? maxLoss : 0) || 1;

  const svgHeight = 360;
  const svgWidth = Math.max(entries.length * 36 + 96, 440);
  const margin = { top: 32, bottom: 40, left: 68, right: 68 };
  const plotWidth = svgWidth - margin.left - margin.right;
  const plotHeight = svgHeight - margin.top - margin.bottom;
  const xStep = entries.length > 1 ? plotWidth / (entries.length - 1) : 0;

  const zeroY =
    margin.top +
    (hasPositive ? (maxGain / totalDeltaRange) * plotHeight : 0);

  const deltaToY = (value) => {
    if (value >= 0) {
      if (!hasPositive || maxGain === 0) {
        return zeroY;
      }
      const positiveRange = zeroY - margin.top;
      return zeroY - (value / maxGain) * positiveRange;
    }
    if (!hasNegative || maxLoss === 0) {
      return zeroY;
    }
    const negativeRange = margin.top + plotHeight - zeroY;
    return zeroY + (Math.abs(value) / maxLoss) * negativeRange;
  };

  const barRects = entries
    .map((item, idx) => {
      const cx = margin.left + idx * xStep;
      const x = cx - 10;
      const yTop = deltaToY(Math.max(item.delta, 0));
      const yBottom = deltaToY(Math.min(item.delta, 0));
      const y = item.delta >= 0 ? yTop : zeroY;
      const height = item.delta >= 0 ? zeroY - yTop : yBottom - zeroY;
      const fill = item.delta >= 0 ? '#7c3aed' : '#f97316';
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="20" height="${Math.abs(height).toFixed(1)}" fill="${fill}" rx="4"></rect>`;
    })
    .join('');

  const linePoints = entries
    .map((item, idx) => {
      const cx = margin.left + idx * xStep;
      const ratio = item.impressions / maxImpressions;
      const y = margin.top + (1 - ratio) * plotHeight;
      return `${cx.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const xLabels = entries
    .map((item, idx) => {
      const cx = margin.left + idx * xStep;
      const label = item.date ? escapeHtml(item.date.slice(5)) : '';
      return `<text x="${cx.toFixed(1)}" y="${svgHeight - 18}" text-anchor="middle">${label}</text>`;
    })
    .join('');

  const gridRatios = [0, 0.25, 0.5, 0.75, 1];
  const leftAxis = gridRatios
    .map((ratio) => {
      const value = maxImpressions * ratio;
      const y = margin.top + (1 - ratio) * plotHeight;
      return `<g transform="translate(0,${y.toFixed(1)})">
        <text x="${margin.left - 14}" text-anchor="end">${formatNumber(value)}</text>
        <line x1="${margin.left - 6}" x2="${svgWidth - margin.right}" stroke="#e2e8f0" stroke-width="0.5" />
      </g>`;
    })
    .join('');

  const deltaTicks = (() => {
    const ticks = new Set([0]);
    if (hasPositive && maxGain > 0) {
      [0.25, 0.5, 0.75, 1].forEach((ratio) => ticks.add(maxGain * ratio));
    }
    if (hasNegative && maxLoss > 0) {
      [0.25, 0.5, 0.75, 1].forEach((ratio) => ticks.add(-maxLoss * ratio));
    }
    return Array.from(ticks)
      .sort((a, b) => b - a)
      .map((value) => `<text x="${svgWidth - margin.right + 14}" y="${deltaToY(value).toFixed(1)}" text-anchor="start">${formatNumber(value)}</text>`)
      .join('');
  })();

  return `
    <section class="chart-section">
      <header>
        <h3>日別インプレッション×フォロワー増</h3>
        <span>ライン：インプレッション（左軸）／バー：フォロワー増加数（右軸）</span>
      </header>
      <div class="combined-chart">
        <svg viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="360">
          <defs>
            <linearGradient id="lineGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stop-color="#60a5fa" />
              <stop offset="100%" stop-color="#2563eb" />
            </linearGradient>
          </defs>
          <rect x="${margin.left}" y="${margin.top}" width="${plotWidth}" height="${plotHeight}" fill="#f8fafc" rx="14"></rect>
          ${leftAxis}
          <line x1="${margin.left}" y1="${zeroY.toFixed(1)}" x2="${svgWidth - margin.right}" y2="${zeroY.toFixed(1)}" stroke="#cbd5f5" stroke-dasharray="4 4" />
          ${barRects}
          <polyline fill="none" stroke="url(#lineGrad)" stroke-width="3" points="${linePoints}" stroke-linecap="round" stroke-linejoin="round"></polyline>
          ${xLabels}
          ${deltaTicks}
        </svg>
      </div>
    </section>
  `;
}

async function renderReport(slug) {
  const accountName = ACCOUNT_MAP[slug];
  if (!accountName) {
    throw new Error(`Unknown competitor slug: ${slug}`);
  }

  const baseDir = path.join('analysis', 'competitors', slug);
  const aggregates = JSON.parse(await fs.readFile(path.join(baseDir, 'aggregates.json'), 'utf8'));
  const dailySummaryRaw = JSON.parse(await fs.readFile(path.join(baseDir, 'daily_summary.json'), 'utf8'));
  const postsRaw = JSON.parse(await fs.readFile(path.join(baseDir, 'posts.json'), 'utf8'));

  const dailySummary = computeDailyWithDelta(dailySummaryRaw);

  const postsWithDelta = postsRaw.map((post) => ({
    ...post,
    followerDelta: 0,
  }));

  const postsByDate = new Map();
  postsWithDelta.forEach((post) => {
    const list = postsByDate.get(post.dateJst) || [];
    list.push(post);
    postsByDate.set(post.dateJst, list);
  });

  const impressionsByDate = new Map();
  postsByDate.forEach((list, date) => {
    const total = list.reduce((sum, item) => sum + (item.impressions || 0), 0);
    impressionsByDate.set(date, total);
  });

  dailySummary.forEach((entry) => {
    const date = entry.date;
    if (!date) return;
    const delta = entry.delta || 0;
    if (!delta) return;

    const currPosts = postsByDate.get(date) || [];
    const prevDate = getPreviousDate(date);
    const prevPosts = prevDate ? postsByDate.get(prevDate) || [] : [];
    const currTotal = impressionsByDate.get(date) || 0;
    const prevTotal = prevDate ? impressionsByDate.get(prevDate) || 0 : 0;

    const totalWeight =
      (prevTotal > 0 ? prevTotal : 0) + (currTotal > 0 ? currTotal : 0);

    let deltaPrev = 0;
    let deltaCurr = 0;

    if (totalWeight > 0) {
      if (prevTotal > 0) {
        deltaPrev = (delta * prevTotal) / totalWeight;
      }
      if (currTotal > 0) {
        deltaCurr = (delta * currTotal) / totalWeight;
      }
    } else if (currPosts.length) {
      deltaCurr = delta;
    } else if (prevPosts.length) {
      deltaPrev = delta;
    }

    distributeDeltaAcrossPosts(prevPosts, prevTotal, deltaPrev);
    distributeDeltaAcrossPosts(currPosts, currTotal, deltaCurr);
  });

  const sortedPosts = [...postsWithDelta].sort((a, b) => b.impressions - a.impressions);
  const topPosts = sortedPosts.slice(0, 10);

  const followerEntries = dailySummary.filter((item) => typeof item.followers === 'number');

  const categoryCards = Object.values(aggregates.categoryBreakdown)
    .sort((a, b) => {
      const aAvg = a.averageImpressions || 0;
      const bAvg = b.averageImpressions || 0;
      if (bAvg !== aAvg) return bAvg - aAvg;
      return (b.posts || 0) - (a.posts || 0);
    })
    .map((entry) => {
      const example = entry.topExamples[0];
      return `
        <article class="category-card">
          <header>
            <h3>${escapeHtml(entry.name)}</h3>
            <span>${formatNumber(entry.posts)}本</span>
          </header>
          <div class="metric-row">
            <span>平均インプレッション</span>
            <strong>${formatNumber(entry.averageImpressions || 0)}</strong>
          </div>
          <div class="metric-row">
            <span>平均いいね率</span>
            <strong>${formatPercent(entry.averageLikeRate || 0)}</strong>
          </div>
          <p class="example">${example ? escapeHtml(example.firstLine) : '—'}</p>
        </article>
      `;
    })
    .join('');

  const postCards = topPosts
    .map((post, index) => {
      const preview = createPreview(post.firstLine || post.content || '');
      const bodyHtml = formatContent(post.content);
      return `
      <article class="post-card">
        <header>
          <span class="rank">#${index + 1}</span>
          <div>
            <p class="meta">${escapeHtml(post.dateJst)} ${escapeHtml(post.timeJst)}<span>${escapeHtml(post.weekdayJst)}</span></p>
            <span class="badge">${escapeHtml(post.category)}</span>
          </div>
        </header>
        <ul class="post-metrics">
          <li><strong>${formatNumber(post.impressions)}</strong><span>インプレッション</span></li>
          <li><strong>${formatNumber(post.likes)}</strong><span>いいね</span></li>
          <li><strong>${formatPercent(post.likeRate)}</strong><span>いいね率</span></li>
          <li><strong>${formatSignedNumber(post.followerDelta)}</strong><span>フォロワー増</span></li>
        </ul>
        ${preview ? `<p class="post-preview">${escapeHtml(preview)}</p>` : ''}
        <details class="post-body">
          <summary>投稿全文を表示</summary>
          <div>${bodyHtml}</div>
        </details>
      </article>
    `;
    })
    .join('');

  const firstFollowersEntry = followerEntries.find((entry) => typeof entry.followers === 'number');
  const lastFollowersEntry = [...followerEntries].reverse().find((entry) => typeof entry.followers === 'number');
  const followerStart = firstFollowersEntry ? firstFollowersEntry.followers : null;
  const followerEnd = lastFollowersEntry ? lastFollowersEntry.followers : followerStart;
  const followerNet = followerStart !== null && followerEnd !== null ? followerEnd - followerStart : aggregates.followerSummary.totalDelta || 0;

  // 日別フォロワー増加数の統計
  const dailyDeltas = dailySummary
    .map((entry) => entry.delta || 0)
    .filter((delta) => delta !== 0);
  const avgDailyDelta = dailyDeltas.length > 0
    ? dailyDeltas.reduce((sum, d) => sum + d, 0) / dailyDeltas.length
    : 0;
  const sortedDeltas = [...dailyDeltas].sort((a, b) => a - b);
  const medianDailyDelta = sortedDeltas.length > 0
    ? sortedDeltas.length % 2 === 0
      ? (sortedDeltas[sortedDeltas.length / 2 - 1] + sortedDeltas[sortedDeltas.length / 2]) / 2
      : sortedDeltas[Math.floor(sortedDeltas.length / 2)]
    : 0;

  const highlights = (() => {
    const items = [];
    const topPost = topPosts[0];
    if (topPost) {
      items.push(`最大リーチは <strong>${escapeHtml(topPost.dateJst)} ${escapeHtml(topPost.timeJst)}「${escapeHtml(topPost.firstLine)}」</strong> の ${formatNumber(topPost.impressions)} インプレッション。`);
    }
    const winnerRate = aggregates.totals.posts ? aggregates.totals.winnerCount / aggregates.totals.posts : 0;
    items.push(`勝ち投稿率は <strong>${formatPercent(winnerRate)}</strong>（${aggregates.totals.winnerCount} / ${aggregates.totals.posts}）。`);
    items.push(`フォロワー純増は <strong>${formatNumber(followerNet)}</strong>（期間内 ${formatNumber(followerStart || 0)} → ${formatNumber(followerEnd || 0)}）。`);
    const topFollowerPost = [...postsWithDelta]
      .filter((post) => post.followerDelta > 0)
      .sort((a, b) => b.followerDelta - a.followerDelta)[0];
    if (topFollowerPost) {
      items.push(`最大フォロワー増投稿は <strong>${escapeHtml(topFollowerPost.dateJst)} ${escapeHtml(topFollowerPost.timeJst)}「${escapeHtml(topFollowerPost.firstLine)}」</strong> の ${formatSignedNumber(topFollowerPost.followerDelta)}。`);
    }
    const peakDeltaDay = dailySummary.reduce(
      (acc, item) => (item.delta > (acc?.delta ?? -Infinity) ? item : acc),
      null,
    );
    if (peakDeltaDay && peakDeltaDay.delta > 0) {
      items.push(`最もフォロワーが増えた日は <strong>${escapeHtml(peakDeltaDay.date)}</strong> の ${formatSignedNumber(peakDeltaDay.delta)}。`);
    }
    const topCategory = Object.values(aggregates.categoryBreakdown).sort((a, b) => b.posts - a.posts)[0];
    if (topCategory) {
      items.push(`最多カテゴリは <strong>${escapeHtml(topCategory.name)}</strong>（${formatNumber(topCategory.posts)}本 / 平均 ${formatNumber(topCategory.averageImpressions || 0)} インプ / 平均いいね率 ${formatPercent(topCategory.averageLikeRate || 0)}）。`);
    }
    return items.map((item) => `<li>${item}</li>`).join('');
  })();

  const statsCards = `
    <section class="stats-grid">
      <article class="card">
        <h3>投稿本数</h3>
        <strong>${formatNumber(aggregates.totals.posts)}本</strong>
        <small>平均 ${(aggregates.totals.posts / LOOKBACK_DAYS).toFixed(2)} 本 / 日</small>
      </article>
      <article class="card">
        <h3>総インプレッション</h3>
        <strong>${formatNumber(aggregates.totals.totalImpressions)}</strong>
        <small>平均 ${formatNumber(aggregates.totals.averageImpressions || 0)} / 中央値 ${formatNumber(aggregates.totals.medianImpressions || 0)}</small>
      </article>
      <article class="card">
        <h3>勝ち投稿（1万インプ超）</h3>
        <strong>${formatNumber(aggregates.totals.winnerCount)}本</strong>
        <small>勝率 ${formatPercent(aggregates.totals.posts ? aggregates.totals.winnerCount / aggregates.totals.posts : 0)}</small>
      </article>
      <article class="card">
        <h3>総いいね・平均率</h3>
        <strong>${formatNumber(aggregates.totals.totalLikes)}件</strong>
        <small>平均いいね率 ${formatPercent(aggregates.totals.averageLikeRate || 0)}</small>
      </article>
      <article class="card">
        <h3>フォロワー純増</h3>
        <strong>${formatNumber(followerNet)}</strong>
        <small>${formatNumber(followerStart || 0)} → ${formatNumber(followerEnd || 0)}</small>
      </article>
      <article class="card">
        <h3>日別フォロワー増加</h3>
        <strong>${formatSignedNumber(avgDailyDelta)}</strong>
        <small>平均 / 中央値 ${formatSignedNumber(medianDailyDelta)}</small>
      </article>
    </section>
  `;

  const html = `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(accountName)}｜Threadsレポート（直近30日）</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Hiragino Sans", "Yu Gothic", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        line-height: 1.6;
      }
      body { margin: 0; padding: 0; background: #f1f4fb; color: #0f172a; }
      .hero { padding: 44px 32px 32px; background: linear-gradient(135deg, #1d4ed8, #6366f1); color: #f8fafc; }
      .hero h1 { margin: 0; font-size: 2.2rem; letter-spacing: 0.01em; }
      .hero p { margin: 10px 0 0; opacity: 0.9; font-size: 0.95rem; }
      .container { max-width: 1080px; margin: 0 auto; padding: 32px 32px 64px; }
      h2 { margin: 48px 0 18px; font-size: 1.55rem; color: #0f172a; }
      .stats-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 16px; }
      .card { background: #ffffff; border-radius: 14px; padding: 20px; border: 1px solid rgba(148, 163, 184, 0.25); box-shadow: 0 12px 24px rgba(15, 23, 42, 0.08); }
      .card h3 { margin: 0 0 6px; font-size: 0.92rem; color: #64748b; font-weight: 600; }
      .card strong { display: block; font-size: 1.75rem; color: #0f172a; letter-spacing: 0.01em; }
      .card small { color: #64748b; font-size: 0.78rem; }
      .chart-section { background: #ffffff; border-radius: 20px; border: 1px solid rgba(148, 163, 184, 0.22); padding: 24px; box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08); }
      .chart-section header { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
      .chart-section h3 { margin: 0; font-size: 1.05rem; color: #0f172a; }
      .chart-section span { font-size: 0.8rem; color: #64748b; }
      .combined-chart svg text { font-size: 0.64rem; fill: #94a3b8; }
      .highlight-list { margin: 0; padding-left: 1.2rem; color: #1f2937; font-size: 0.95rem; }
      .highlight-list li + li { margin-top: 6px; }
      .category-grid { display: grid; gap: 18px; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
      .category-card { background: #ffffff; border-radius: 16px; border: 1px solid rgba(148, 163, 184, 0.2); padding: 20px; box-shadow: 0 12px 26px rgba(15, 23, 42, 0.08); }
      .category-card header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 12px; }
      .category-card h3 { margin: 0; font-size: 1rem; color: #0f172a; }
      .category-card header span { font-size: 0.8rem; color: #64748b; }
      .category-card .metric-row { display: flex; justify-content: space-between; color: #334155; font-size: 0.88rem; margin: 4px 0; }
      .category-card .example { margin-top: 12px; font-size: 0.86rem; color: #475569; }
      .posts-grid { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); }
      .post-card { background: #ffffff; border-radius: 14px; border: 1px solid rgba(148, 163, 184, 0.22); padding: 18px; box-shadow: 0 10px 22px rgba(15, 23, 42, 0.08); display: flex; flex-direction: column; gap: 12px; }
      .post-card header { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
      .post-card .rank { font-size: 1rem; font-weight: 600; color: #2563eb; }
      .post-card .meta { margin: 0; color: #1f2937; font-size: 0.9rem; }
      .post-card .meta span { margin-left: 6px; font-size: 0.8rem; color: #475569; }
      .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; background: rgba(37, 99, 235, 0.12); color: #1d4ed8; font-size: 0.72rem; font-weight: 600; }
      .post-metrics { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); margin: 4px 0 6px; padding: 0; list-style: none; color: #1f2937; font-size: 0.8rem; }
      .post-metrics li { display: flex; flex-direction: column; gap: 1px; }
      .post-metrics strong { font-size: 1rem; color: #0f172a; }
      .post-preview { margin: 0; font-size: 0.95rem; color: #1e293b; font-weight: 600; }
      .post-body { border-radius: 12px; background: rgba(226, 232, 240, 0.45); padding: 12px 14px; font-size: 0.9rem; color: #1e293b; }
      .post-body summary { cursor: pointer; list-style: none; font-weight: 600; color: #2563eb; display: flex; align-items: center; gap: 6px; }
      .post-body summary::-webkit-details-marker { display: none; }
      .post-body summary::after { content: '＋'; font-size: 0.75rem; transition: transform 0.2s ease; }
      .post-body[open] summary::after { content: '－'; }
      .post-body div { margin-top: 10px; line-height: 1.65; }
      .post-body div br + br { margin-bottom: 6px; }
      .muted { color: #94a3b8; }
      .cta { margin-top: 52px; padding: 24px; border-radius: 16px; background: linear-gradient(120deg, rgba(37, 99, 235, 0.12), rgba(99, 102, 241, 0.18)); border: 1px solid rgba(99, 102, 241, 0.28); box-shadow: 0 16px 28px rgba(59, 130, 246, 0.16); }
      .cta p { margin: 0 0 12px; color: #1f2937; }
      .cta a { display: inline-block; padding: 10px 18px; border-radius: 10px; background: rgba(37, 99, 235, 0.14); color: #1d4ed8; text-decoration: none; font-weight: 600; }
      @media (max-width: 1280px) {
        .stats-grid { grid-template-columns: repeat(3, 1fr); }
      }
      @media (max-width: 820px) {
        .stats-grid { grid-template-columns: repeat(2, 1fr); }
        .chart-section header { flex-direction: column; align-items: flex-start; }
      }
      @media (max-width: 640px) {
        .stats-grid { grid-template-columns: 1fr; }
        .hero { padding: 36px 22px 24px; }
        .container { padding: 28px 22px 60px; }
      }
    </style>
  </head>
  <body>
    <header class="hero">
      <h1>${escapeHtml(accountName)}｜Threads運用レポート</h1>
      <p>対象期間：2025-09-17 〜 2025-10-16（直近30日）</p>
    </header>
    <main class="container">
      ${statsCards}
      <section>
        <h2>日別推移</h2>
        ${buildCombinedChart(dailySummary)}
      </section>
      <section>
        <h2>ハイライト</h2>
        <ul class="highlight-list">${highlights}</ul>
      </section>
      <section>
        <h2>インプレッション上位トップ10（クリックで本文表示）</h2>
        <div class="posts-grid">${postCards}</div>
      </section>
      <section>
        <h2>カテゴリ別パフォーマンス</h2>
        <div class="category-grid">${categoryCards}</div>
      </section>
      <section class="cta">
        <p>最新データに更新したい場合は <code>GOOGLE_APPLICATION_CREDENTIALS=... node scripts/exportCompetitorInsights.js</code> を実行してください。</p>
        <a href="posts.csv">posts.csv を開く</a>
      </section>
    </main>
  </body>
</html>`;

  await fs.writeFile(path.join(baseDir, 'report.html'), html, 'utf8');
  console.log(`Report rendered: ${baseDir}/report.html`);
}

async function main() {
  const slug = process.argv[2];
  if (!slug || !ACCOUNT_MAP[slug]) {
    console.error('Usage: renderCompetitorReport.js <monoguchi|sugi>');
    process.exit(1);
  }

  await renderReport(slug);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
