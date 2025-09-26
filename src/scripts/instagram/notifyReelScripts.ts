#!/usr/bin/env tsx

import { config } from 'dotenv';
config({ path: '.env.local' });
import nodemailer from 'nodemailer';
import { BigQuery } from '@google-cloud/bigquery';
import { loadInstagramConfig } from '@/lib/instagram/config';
import { createInstagramBigQuery } from '@/lib/instagram/bigquery';

interface ScriptRow {
  title: string;
  hook: string;
  body: string;
  cta: string;
  story_text: string;
  inspiration_sources: string[];
}

async function main(): Promise<void> {
  const config = loadInstagramConfig();
  const bigquery = createInstagramBigQuery();

  const scripts = await fetchLatestScripts(bigquery, config);
  if (scripts.length === 0) {
    console.warn('[instagram/notify] No scripts found for delivery');
    return;
  }

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });

  const subject = `AutoStudio Instagram 台本 (${new Date().toISOString().slice(0, 10)})`;
  const html = renderEmailHtml(scripts);

  await transporter.sendMail({
    from: config.emailFrom,
    to: config.emailTo,
    subject,
    html,
  });

  console.log('[instagram/notify] Email sent');
}

async function fetchLatestScripts(bigquery: BigQuery, config: ReturnType<typeof loadInstagramConfig>): Promise<ScriptRow[]> {
  const query = `
    SELECT
      title,
      hook,
      body,
      cta,
      story_text,
      inspiration_sources
    FROM \
\`${config.projectId}.${config.dataset}.my_reels_scripts\`
    WHERE snapshot_date = (
      SELECT MAX(snapshot_date)
      FROM \
\`${config.projectId}.${config.dataset}.my_reels_scripts\`
    )
    ORDER BY created_at DESC
    LIMIT 2
  `;

  const [rows] = await bigquery.query(query, { location: config.location });
  return rows as ScriptRow[];
}

function renderEmailHtml(scripts: ScriptRow[]): string {
  const items = scripts
    .map((script, index) => {
      const inspiration = script.inspiration_sources?.length
        ? `<p><strong>Inspiration:</strong> ${script.inspiration_sources.join(', ')}</p>`
        : '';
      return `
        <section style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px;">
          <h2 style="margin:0 0 12px;font-size:18px;">台本 ${index + 1}: ${escapeHtml(script.title)}</h2>
          <p><strong>Hook:</strong><br>${escapeHtml(script.hook)}</p>
          <p><strong>Body:</strong><br>${escapeHtml(script.body)}</p>
          <p><strong>CTA:</strong><br>${escapeHtml(script.cta)}</p>
          <p><strong>Story:</strong><br>${escapeHtml(script.story_text)}</p>
          ${inspiration}
        </section>
      `;
    })
    .join('\n');

  return `
    <div>
      <p>今日のInstagramリール台本案です。</p>
      ${items}
      <p style="margin-top:24px;color:#64748b;font-size:12px;">AutoStudio generated</p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

main().catch((error) => {
  console.error('[instagram/notify] Failed', error);
  process.exitCode = 1;
});

