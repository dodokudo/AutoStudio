import { readFileSync, writeFileSync } from 'node:fs';
import dotenv from 'dotenv';
import { assertDriveTreeMatch, driveBatches, parseThreadsDriveCsv, snapshotFileDate } from '../lib/threadsDriveCsv';
import { matchSupplementalPost } from '../lib/threadsSupplementalMetrics';

dotenv.config({ path: '.env.local', quiet: true });

async function main() {
  const args = process.argv.slice(2);
  const value = (name: string) => {
    const at = args.indexOf(name);
    if (at < 0) return undefined;
    if (!args[at + 1] || args[at + 1].startsWith('--')) throw new Error(`Missing ${name} value`);
    return args[at + 1];
  };
  const csv = value('--csv');
  const fileId = value('--file-id');
  const date = value('--date');
  const write = args.includes('--write');
  const reportPath = value('--report');
  if (csv && fileId) throw new Error('Choose --csv or --file-id');
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Expected --date YYYY-MM-DD');
  const { createThreadsDriveReader } = await import('../lib/threadsDriveReader');
  const { findSupplementalPostCandidates, saveSupplementalInsights } = await import('../lib/threadsSupplementalInsights');
  const { prepareDriveReplies } = await import('../lib/threadsDriveCatalog');
  const reader = createThreadsDriveReader();
  const files = csv ? [{ id: '', name: csv }] : fileId ? [{ id: fileId, name: '' }]
    : (await reader.list()).filter((file) => !date || snapshotFileDate(file.name) === date);
  if (!files.length) throw new Error('No completed daily CSV found; no data imported');
  const state = write ? await (await import('../lib/threadsDriveImportState')).createThreadsDriveImportState() : undefined;
  if (state === null) {
    console.log(JSON.stringify({ status: 'already_running', imported: 0 }));
    return;
  }
  try {
    let accepted = 0;
    const reports: Array<Record<string, unknown>> = [];
    const saveReport = () => { if (reportPath) writeFileSync(reportPath, JSON.stringify(reports, null, 2) + '\n'); };
    const failures: string[] = [];
    for (const file of files) {
      try {
        const source = csv ? { text: readFileSync(csv, 'utf8'), id: '', name: csv, version: '' } : await reader.read(file.id);
        if (state && source.id && !args.includes('--reprocess') && await state.alreadyImported(source.id, source.version)) {
          console.log(JSON.stringify({ file: source.name, version: source.version, status: 'unchanged' }));
          continue;
        }
        const rows = parseThreadsDriveCsv(source.text, date ?? snapshotFileDate(source.name) ?? undefined).map((row) => ({ ...row,
          ...(source.id ? { drive_file_id: source.id, drive_file_name: source.name, drive_file_version: source.version } : {}),
        }));
        const registered = await prepareDriveReplies(rows, write);
        const matched: typeof rows = [];
        const pending: Array<{ post_id: string | null; post_url: string; reason: string }> = [];
        let resolvedReplies = 0;
        // Validate every identity in the file before writing any batch.
        for (const batch of driveBatches(rows)) {
          const candidates = [...await findSupplementalPostCandidates(batch), ...registered];
          for (const snapshot of batch.snapshots) {
            const row = snapshot as typeof rows[number];
            try {
              const match = matchSupplementalPost(row, candidates);
              assertDriveTreeMatch(row, match);
              matched.push(row);
              if (match.node_type === 'reply') resolvedReplies++;
            } catch (error) {
              pending.push({ post_id: row.post_id, post_url: row.post_url, reason: (error as Error).message });
            }
          }
        }
        const report = { file: source.name, fileId: source.id || null, version: source.version || null,
          registeredReplies: registered.length, dryRun: !write, total: rows.length, matched: matched.length, replies: resolvedReplies,
          posts: matched.length - resolvedReplies, pending, accepted: 0,
          classificationResolvedFromDatabase: matched.filter((row) => row.is_self_reply === null).length,
          follows: matched.reduce((sum, row) => sum + (row.follows ?? 0), 0),
          missingFollows: matched.filter((row) => row.follows === null).length };
        reports.push(report);
        saveReport();
        if (pending.length) console.warn(JSON.stringify({ file: source.name, status: 'pending', pendingCount: pending.length, pending: pending.slice(0, 20) }));
        for (const batch of driveBatches(matched)) {
          if (write) {
            const saved = (await saveSupplementalInsights(batch)).accepted;
            accepted += saved;
            report.accepted += saved;
            saveReport();
          }
        }
        console.log(JSON.stringify({ ...report, pending: pending.length, acceptedSoFar: accepted }));
        if (state && source.id) await state.complete(source.id, source.version, matched.length, report);
      } catch (error) {
        const reason = (error as Error).message;
        failures.push(file.name || file.id);
        console.error(JSON.stringify({ file: file.name || file.id, status: 'failed', reason }));
        reports.push({ file: file.name || file.id, status: 'failed', reason });
        saveReport();
      }
    }
    if (failures.length) throw new Error(`${failures.length} files failed; remaining files were processed`);
  } finally {
    await state?.release();
  }
}

main().catch((error) => {
  // Do not log Google request objects, which may contain authorization headers.
  console.error(`Drive import stopped: ${error.message}. Earlier successful batches may remain; fix the cause and replay serially.`);
  process.exitCode = 1;
});
