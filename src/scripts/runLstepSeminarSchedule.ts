import { config as loadDotenv } from 'dotenv';
import { formatResult, runSeminarSchedule } from '@/lib/lstep/seminarSlotRunner';
import { notifySeminarSchedule } from '@/lib/lstep/seminarNotification';

loadDotenv({ path: '.env.local' });

const apply = process.argv.includes('--apply');
const extraSlots = process.argv.includes('--test-append-one') ? 1 : 0;

runSeminarSchedule({ apply, extraSlots })
  .then(async (result) => {
    console.log(formatResult(result));
    if (apply) await notifySeminarSchedule(result);
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
