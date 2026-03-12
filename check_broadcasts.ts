import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createBigQueryClient, resolveProjectId } from "./src/lib/bigquery";
const pid = resolveProjectId(process.env.LSTEP_BQ_PROJECT_ID || process.env.BQ_PROJECT_ID);
const bq = createBigQueryClient(pid);

async function main() {
  const [rows] = await bq.query({
    query: `SELECT DISTINCT broadcast_id, broadcast_name, sent_at, MAX(delivery_count) AS dc FROM \`${pid}.autostudio_lstep.broadcast_metrics\` GROUP BY broadcast_id, broadcast_name, sent_at ORDER BY broadcast_id`,
    useLegacySql: false,
  });
  console.log("=== 全ブロードキャスト ===");
  for (const r of rows as any[]) {
    const sentAt = String(r.sent_at).replace(/\n/g, " ");
    console.log(`ID:${r.broadcast_id} | 配信:${r.dc} | ${sentAt} | ${r.broadcast_name}`);
  }

  const [funnelRows] = await bq.query({
    query: `SELECT data FROM \`${pid}.marketing.funnels\` WHERE id = 'funnel-1770198372071'`,
    useLegacySql: false,
  });
  const funnel = JSON.parse((funnelRows[0] as any).data);
  const noId = funnel.deliveries.filter((d: any) => {
    if (d.lstepBroadcastId) return false;
    if (d.type !== "message") return false;
    if (d.id.startsWith("ig-") || d.id.startsWith("th-")) return false;
    return true;
  });
  console.log("\n=== broadcastId未設定LINE配信 ===");
  for (const d of noId) {
    console.log(`[${d.date} ${d.time || "-"}] ${d.id} | ${d.title} | seg:${d.segmentId}`);
  }
}
main().catch(e => console.error(e));
