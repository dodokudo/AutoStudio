import { config as loadDotenv } from 'dotenv';
import { Storage } from '@google-cloud/storage';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_SEMINAR_LAUNCH_CONFIG_OBJECT,
  formatSeminarLaunchConfigSummary,
  parseSeminarLaunchConfig,
} from '@/lib/lstep/seminarLaunchConfig';

loadDotenv({ path: '.env.local' });

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'validate';
  const configIndex = process.argv.indexOf('--config');
  const configPath = configIndex >= 0 ? process.argv[configIndex + 1] : undefined;
  const apply = process.argv.includes('--apply');

  if (!configPath) throw new Error('--config <JSONファイル> を指定してください');

  const raw = await readFile(configPath, 'utf8');
  const launchConfig = parseSeminarLaunchConfig(JSON.parse(raw));
  console.log(formatSeminarLaunchConfigSummary(launchConfig));

  if (command === 'validate') {
    console.log('\nVALID: 設定形式と時刻の対応に問題ありません');
  } else if (command === 'publish') {
    const bucketName = process.env.LSTEP_GCS_BUCKET;
    const objectName = process.env.LSTEP_SEMINAR_LAUNCH_CONFIG_OBJECT ?? DEFAULT_SEMINAR_LAUNCH_CONFIG_OBJECT;
    if (!bucketName) throw new Error('LSTEP_GCS_BUCKET が未設定です');
    console.log(`\npublish target: gs://${bucketName}/${objectName}`);
    if (!apply) {
      console.log('DRY-RUN: 書き込みはしていません。実行する場合は --apply を付けてください');
    } else {
      await new Storage().bucket(bucketName).file(objectName).save(`${JSON.stringify(launchConfig, null, 2)}\n`, {
        contentType: 'application/json',
        resumable: false,
      });
      console.log('PUBLISHED: 検証済み設定を保存しました');
    }
  } else {
    throw new Error(`不明なcommandです: ${command}（validate または publish）`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
