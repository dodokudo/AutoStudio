import { NextResponse } from 'next/server';
import { pushLineMessage, splitMessage } from '@/lib/line/messaging';
import { getDailyReportData } from '@/lib/line/sns-report-data';
import { formatDailyReport } from '@/lib/line/sns-report';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '';
const LINE_REPORT_USER_ID = process.env.LINE_REPORT_USER_ID ?? 'U37911e372e72aa50ca3a53f1c491fde6';

export async function GET() {
  const startTime = Date.now();

  try {
    // Yesterday in JST
    const now = new Date();
    const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const yesterday = new Date(jstNow);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const dateStr = yesterday.toISOString().slice(0, 10);

    console.log(`[cron/line-report/daily] Generating report for ${dateStr}`);

    const data = await getDailyReportData(dateStr);
    const message = formatDailyReport(data);

    const messages = splitMessage(message).map((text) => ({
      type: 'text' as const,
      text,
    }));

    await pushLineMessage(LINE_CHANNEL_ACCESS_TOKEN, {
      to: LINE_REPORT_USER_ID,
      messages,
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[cron/line-report/daily] Sent in ${duration}s`);

    return NextResponse.json({
      success: true,
      date: dateStr,
      messageLength: message.length,
      duration: `${duration}s`,
    });
  } catch (error) {
    console.error('[cron/line-report/daily] Failed:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
