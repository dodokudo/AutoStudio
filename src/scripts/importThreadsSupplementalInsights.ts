import { readFileSync, writeFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local', quiet: true });

async function main() {
  const args = process.argv.slice(2);
  const value = (name: string) => {
    const index = args.indexOf(name);
    return index < 0 ? undefined : args[index + 1];
  };
  const file = value('--csv');
  const observedAt = value('--snapshot-at');
  if (!file || !observedAt) throw new Error('Required: --csv PATH --snapshot-at ACTUAL_ISO_OBSERVATION_TIME [--output PATH] [--write]');
  const { validateSupplementalBatch, SUPPLEMENTAL_METRICS } = await import('../lib/threadsSupplementalMetrics');
  const { resolveSupplementalPosts, saveSupplementalInsights } = await import('../lib/threadsSupplementalInsights');
  const csv = parse(readFileSync(file, 'utf8'), { columns: true, skip_empty_lines: true }) as Record<string, string>[];
  const batch = validateSupplementalBatch({
    source: 'muse_threads', account_username: 'kudooo_ai',
    snapshots: csv.map((row) => ({
      post_url: row.url, snapshot_at: row.snapshot_at || observedAt,
      ...Object.fromEntries(SUPPLEMENTAL_METRICS.map((metric) => [metric,
        row[metric] == null || row[metric].trim() === '' ? null : Number(row[metric]),
      ])),
    })),
  });
  batch.snapshots = await resolveSupplementalPosts(batch);
  const output = value('--output');
  if (output) writeFileSync(output, JSON.stringify(batch, null, 2) + '\n');
  if (args.includes('--write')) {
    console.log(JSON.stringify(await saveSupplementalInsights(batch), null, 2));
  } else {
    console.log(JSON.stringify({ dryRun: true, matched: batch.snapshots.length, snapshotAt: observedAt,
      follows: batch.snapshots.reduce((sum, row) => sum + (row.follows ?? 0), 0),
      missingFollows: batch.snapshots.filter((row) => row.follows === null).length,
    }, null, 2));
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
