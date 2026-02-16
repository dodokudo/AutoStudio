import { NextResponse } from 'next/server';
import { pushLineMessage, splitMessage } from '@/lib/line/messaging';
import { getWeeklyReportData } from '@/lib/line/sns-report-data';
import { formatWeeklyReport } from '@/lib/line/sns-report';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
const LINE_REPORT_USER_ID = process.env.LINE_REPORT_USER_ID ?? 'U37911e372e72aa50ca3a53f1c491fde6';

export async function GET() {
  const startTime = Date.now();

  try {
    // Calculate last week Mon-Sun in JST
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);

    const dow = jstNow.getUTCDay(); // 0=Sun, 1=Mon
    // Last Monday: if today is Monday(1), last Monday = -7 days
    const daysToLastMonday = dow === 0 ? 6 : dow - 1 + 7;
    const lastMonday = new Date(jstNow);
    lastMonday.setUTCDate(jstNow.getUTCDate() - daysToLastMonday);
    const lastSunday = new Date(lastMonday);
    lastSunday.setUTCDate(lastMonday.getUTCDate() + 6);

    const weekStart = lastMonday.toISOString().slice(0, 10);
    const weekEnd = lastSunday.toISOString().slice(0, 10);

    console.log(`[cron/line-report/weekly] Generating report for ${weekStart} ~ ${weekEnd}`);

    const data = await getWeeklyReportData(weekStart, weekEnd);
    const message = formatWeeklyReport(data);

    const messages = splitMessage(message).map((text) => ({
      type: 'text' as const,
      text,
    }));

    await pushLineMessage(LINE_CHANNEL_ACCESS_TOKEN, {
      to: LINE_REPORT_USER_ID,
      messages,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[cron/line-report/weekly] Sent in ${duration}s`);

    return NextResponse.json({
      success: true,
      weekStart,
      weekEnd,
      messageLength: message.length,
      duration: `${duration}s`,
    });
  } catch (error) {
    console.error('[cron/line-report/weekly] Failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
