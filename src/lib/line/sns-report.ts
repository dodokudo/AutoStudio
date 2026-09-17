import type { DailyReportData, WeeklyReportData } from './sns-report-data';

function sign(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${n}`;
  return '±0';
}

function num(n: number): string {
  return n.toLocaleString('ja-JP');
}

function yen(n: number): string {
  return `¥${n.toLocaleString('ja-JP')}`;
}

function formatDate(dateStr: string): string {
  return dateStr.replace(/-/g, '/');
}

// ---------------------------------------------------------------------------
// Daily
// ---------------------------------------------------------------------------

export function formatDailyReport(d: DailyReportData): string {
  const lines: string[] = [];

  lines.push(`📊 デイリーレポート（${formatDate(d.reportDate)}）`);
  lines.push('');

  // LINE
  lines.push('🟢 LINE');
  lines.push(`- 登録数：${d.lineDelta}人`);
  lines.push('');

  // Threads
  lines.push('💻 Threads');
  lines.push(`- フォロワー数：${num(d.thFollowers)}（${sign(d.thFollowerDelta)}）`);
  lines.push(`- 投稿数：${d.thPostCount}`);
  lines.push(`- インプレッション：${num(d.thImpressions)}`);
  lines.push(`- プロフクリック：${d.thProfileClicks}`);
  lines.push(`- リンククリック：${d.thLinkClicks}`);
  lines.push(`- LINE登録数：${d.thLineRegistrations}`);
  lines.push('');

  // Instagram
  lines.push('📱 Instagram');
  lines.push(`- フォロワー数：${num(d.igFollowers)}（${sign(d.igFollowerDelta)}）`);
  lines.push(`- 投稿数：${d.igPostCount}`);
  lines.push(`- リーチ：${num(d.igReach)}`);
  lines.push(`- リンククリック：${d.igLinkClicks}`);
  lines.push(`- LINE登録数：${d.igLineRegistrations}`);
  lines.push('');

  // Story
  lines.push('ストーリー');
  lines.push(`- 投稿数：${d.igStoryCount}`);
  lines.push(`- 閲覧数：${num(d.igStoryViews)}`);
  lines.push(`- 閲覧率：${d.igStoryViewRate}%`);
  lines.push('');

  // MoneyForward 支出
  lines.push('💰 支出');
  lines.push(`- 合計：${yen(d.mfExpense)}`);
  lines.push('');

  lines.push('🏦 口座残高');
  if (!d.mfBankBalances?.length) {
    lines.push('- 残高を取得できませんでした');
  } else {
    for (const balance of d.mfBankBalances) {
      const bank = ({ 'GMOあおぞらネット銀行': 'GMO', '楽天銀行': '楽天' } as Record<string, string>)[balance.bank] ?? balance.bank;
      const warning = balance.amount != null && balance.status !== 'ok' ? '（連携エラー）' : '';
      lines.push(`- ${bank}：${balance.amount == null ? '未取得' : yen(balance.amount)}${warning}`);
    }
    if (d.mfBankBalances.every((balance) => balance.amount != null)) {
      lines.push(`- 合計：${yen(d.mfBankBalances.reduce((sum, balance) => sum + balance.amount!, 0))}`);
    } else {
      lines.push('- 合計：一部の口座残高が未取得のため集計できません');
    }
  }
  lines.push('');

  // Auto comments
  const comments = generateAutoComments(d);
  if (comments.length > 0) {
    lines.push('📌 コメント');
    for (const c of comments) {
      lines.push(`・${c}`);
    }
  }

  return lines.join('\n').trim();
}

function generateAutoComments(d: DailyReportData): string[] {
  const comments: string[] = [];

  if (d.lineDelta <= 3) {
    comments.push('LINE登録数が少ない！');
  }
  if (d.thPostCount === 0) {
    comments.push('Threads昨日投稿してないぞ。今日は投稿！');
  }
  if (d.igStoryCount === 0) {
    comments.push('ストーリー投稿がありません');
  }

  return comments;
}

// ---------------------------------------------------------------------------
// Weekly
// ---------------------------------------------------------------------------

export function formatWeeklyReport(w: WeeklyReportData): string {
  const lines: string[] = [];

  lines.push(`📈 週次レポート（${formatDate(w.weekStart)}〜${formatDate(w.weekEnd)}）`);
  lines.push('');

  // LINE
  lines.push('🟢 LINE');
  lines.push(`- 登録数：${w.lineDelta}人`);
  lines.push('');

  // Threads
  lines.push('💻 Threads');
  lines.push(`- フォロワー数：${num(w.thFollowersWeekEnd)}（${sign(w.thFollowerDelta)}）`);
  lines.push(`- 投稿数：${w.thPostCount}`);
  lines.push(`- インプレッション：${num(w.thImpressions)}`);
  lines.push(`- プロフクリック：${w.thProfileClicks}`);
  lines.push(`- リンククリック：${w.thLinkClicks}`);
  lines.push(`- LINE登録数：${w.thLineRegistrations}`);
  lines.push('');

  // Instagram
  lines.push('📱 Instagram');
  lines.push(`- フォロワー数：${num(w.igFollowersWeekEnd)}（${sign(w.igFollowerDelta)}）`);
  lines.push(`- 投稿数：${w.igPostCount}`);
  lines.push(`- リーチ：${num(w.igReach)}`);
  lines.push(`- リンククリック：${w.igLinkClicks}`);
  lines.push(`- LINE登録数：${w.igLineRegistrations}`);
  lines.push('');

  // Story
  lines.push('ストーリー');
  lines.push(`- 投稿数：${w.igStoryCount}`);
  lines.push(`- 閲覧数：${num(w.igStoryViews)}`);
  lines.push('');

  // Weekly spending
  lines.push('💰 支出');
  lines.push(`- 週間合計：${yen(w.mfWeekExpense)}`);
  lines.push('');

  // Monthly cumulative vs last month
  lines.push(`🗓 月間累積（${w.monthLabel}）`);
  lines.push('');
  lines.push(`🟢 LINE：${w.monthLineDelta}人（先月同時点：${w.lastMonthLineDelta}人）`);
  lines.push('');
  lines.push('💻 Threads');
  lines.push(`- フォロワー増：${sign(w.monthThFollowerDelta)}（先月：${sign(w.lastMonthThFollowerDelta)}）`);
  lines.push(`- 投稿数：${w.monthThPostCount}`);
  lines.push(`- インプレッション：${num(w.monthThImpressions)}`);
  lines.push('');
  lines.push('📱 Instagram');
  lines.push(`- フォロワー増：${sign(w.monthIgFollowerDelta)}（先月：${sign(w.lastMonthIgFollowerDelta)}）`);
  lines.push(`- リーチ：${num(w.monthIgReach)}`);
  lines.push('');
  lines.push('💰 支出');
  lines.push(`- 月間合計：${yen(w.monthMfExpense)}（先月同時点：${yen(w.lastMonthMfExpense)}）`);

  return lines.join('\n').trim();
}
