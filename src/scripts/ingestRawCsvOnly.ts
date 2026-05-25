import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { BigQuery } from '@google-cloud/bigquery';
import { Storage } from '@google-cloud/storage';
import { loadLstepConfig } from '@/lib/lstep/config';
import { loadRawCsvToBigQuery } from '@/lib/lstep/rawCsvLoader';

async function main(): Promise<void> {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: npx tsx src/scripts/ingestRawCsvOnly.ts <csv-path>');
    process.exit(1);
  }

  const config = loadLstepConfig();
  const storage = new Storage();
  const bigquery = new BigQuery({ projectId: config.projectId });

  const now = new Date();
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const snapshotDate = dateFormatter.format(now);

  console.log(`📄 CSVファイル: ${csvPath}`);
  console.log(`📅 スナップショット日付: ${snapshotDate}`);
  console.log(`⚠️ lstep_friends_raw のみ更新（user_core/tags/sources/surveys は触らない）`);

  await loadRawCsvToBigQuery(storage, bigquery, config, csvPath, snapshotDate);

  console.log('✅ Raw CSVのBigQueryロード完了');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
