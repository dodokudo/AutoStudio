import { config as loadDotenv } from 'dotenv';
import { formatResult, runSeminarSchedule } from '@/lib/lstep/seminarSlotRunner';
import { notifySeminarSchedule } from '@/lib/lstep/seminarNotification';
import { loadSeminarLaunchConfig } from '@/lib/lstep/seminarLaunchConfig';

loadDotenv({ path: '.env.local' });

const apply = process.argv.includes('--apply');
const extraSlots = process.argv.includes('--test-append-one') ? 1 : 0;
const configIndex = process.argv.indexOf('--config');
const inlineConfig = process.argv.find((argument) => argument.startsWith('--config='))?.slice('--config='.length);
const configPath = inlineConfig ?? (configIndex >= 0 ? process.argv[configIndex + 1] : undefined);
const ignoreWindow = process.argv.includes('--preview');

loadSeminarLaunchConfig(configPath ? { localPath: configPath } : {})
  .then((launchConfig) => runSeminarSchedule({ apply, extraSlots, launchConfig, ignoreWindow }))
  .then(async (result) => {
    console.log(formatResult(result));
    const performedWork = result.steps.some((step) => step.status !== 'skipped');
    if (apply && (performedWork || result.issues.length > 0)) await notifySeminarSchedule(result);
    if (result.issues.length) process.exitCode = 1;
  })
  .catch(async (error) => {
    console.error(error);
    if (apply) {
      const message = error instanceof Error ? error.message : String(error);
      await notifySeminarSchedule({
        ranAt: new Date().toISOString(),
        mode: 'apply',
        steps: [{ step: '処理中断', status: 'failed', detail: message }],
        issues: [message],
      }).catch((notifyError) => console.error(notifyError));
    }
    process.exitCode = 1;
  });
