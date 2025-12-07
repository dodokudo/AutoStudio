import { BigQuery } from "@google-cloud/bigquery";

const client = new BigQuery({ projectId: "mark-454114" });

async function analyze() {
  const [posts] = await client.query({
    query: `
      SELECT
        content,
        impressions_total as impressions,
        likes_total as likes
      FROM \`mark-454114.autostudio_threads.threads_posts\`
      WHERE posted_at IS NOT NULL
        AND DATE(posted_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 60 DAY)
      ORDER BY impressions_total DESC
    `
  });

  const getFirstRealLine = (content: string): string => {
    const lines = (content || "").split("\n").filter(l => l.trim());
    for (const line of lines) {
      const cleaned = line.replace(/^【メイン投稿】\s*/, "").replace(/^【コメント欄\d+】\s*/, "").trim();
      if (cleaned && !cleaned.startsWith("【")) {
        return cleaned;
      }
    }
    return "";
  };

  const existingPatterns: Record<string, RegExp> = {
    "緊急・速報系": /(緊急|速報|ヤバい|ヤバすぎ)/,
    "時代遅れ系": /時代遅れ/,
    "損してます系": /(損|無駄|もったいない)/,
    "質問系": /[？?]$/,
    "〜してる人系": /(してる人|やってる人|使ってる人)/,
    "数字・具体性": /(\d+分|\d+時間|\d+倍|\d+人|\d+%)/,
  };

  const others: Array<{ firstLine: string; impressions: number }> = [];
  (posts as Array<{ content: string; impressions: number }>).forEach(p => {
    const firstLine = getFirstRealLine(p.content);
    let matched = false;
    for (const regex of Object.values(existingPatterns)) {
      if (regex.test(firstLine)) {
        matched = true;
        break;
      }
    }
    if (!matched && firstLine) {
      others.push({ firstLine, impressions: p.impressions || 0 });
    }
  });

  console.log("=== その他に分類された高パフォーマンス投稿 TOP30 ===\n");
  others.sort((a, b) => b.impressions - a.impressions).slice(0, 30).forEach((p, i) => {
    console.log(`${i+1}. imp:${p.impressions} - ${p.firstLine.slice(0, 70)}`);
  });

  console.log("\n\n=== パターン候補分析 ===");

  const newPatterns: Record<string, RegExp> = {
    "間違ってます系": /間違/,
    "〜な人へ系": /(な人へ|したい人|必見)/,
    "知らない系": /(知らない|気づいてない)/,
    "実は系": /実は/,
    "〜だけで系": /だけで/,
    "終わります系": /終わ/,
    "変わりました系": /(変わり|激変|変化)/,
  };

  Object.entries(newPatterns).forEach(([name, regex]) => {
    const matched = others.filter(p => regex.test(p.firstLine));
    if (matched.length > 0) {
      const avgImp = Math.round(matched.reduce((s, p) => s + p.impressions, 0) / matched.length);
      console.log(`\n【${name}】${matched.length}件, 平均imp:${avgImp}`);
      matched.slice(0, 3).forEach(p => {
        console.log(`  例: ${p.firstLine.slice(0, 60)}...`);
      });
    }
  });
}

analyze().catch(console.error);
