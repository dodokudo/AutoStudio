import { config as loadEnv } from "dotenv";
import path from "node:path";
import { google } from "googleapis";

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), ".env.local") });

const COMPETITOR_SPREADSHEET_ID = "1AdMikjnk6OPLCi_iijeeFkRPvfRQgkIUCZy85u6_qdQ";

function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let date: Date | null = null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    date = new Date(trimmed + "T00:00:00Z");
  } else if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(trimmed)) {
    const replaced = trimmed.replace(/\//g, "-");
    console.log(`  変換: "${trimmed}" → "${replaced}"`);
    date = new Date(replaced);
    console.log(`  Date: ${date}, ISO: ${date.toISOString()}`);
  } else {
    date = new Date(trimmed);
  }

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

async function test() {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });

  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: COMPETITOR_SPREADSHEET_ID,
    range: "'全体投稿'!A:H",
  });

  const values = response.data.values || [];
  const header = values[0];
  const dateIdx = header.indexOf("投稿日");

  const jan2026 = values.slice(1).filter(row => {
    const date = row[dateIdx];
    return date && (date.startsWith("2026/1/") || date.startsWith("2026/01/"));
  });

  console.log("スプレッドシートの1月データ → パース結果:\n");
  jan2026.slice(-3).forEach(row => {
    const original = row[dateIdx];
    console.log(`\n元データ: "${original}"`);
    const parsed = parseDate(original);
    console.log(`最終結果: ${parsed}`);
  });
}

test().catch(console.error);
