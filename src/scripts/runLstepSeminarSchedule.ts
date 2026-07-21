import { config as loadDotenv } from 'dotenv';
import { formatResult, runSeminarSchedule } from '@/lib/lstep/seminarSlotRunner';

loadDotenv({ path: '.env.local' });

const apply = process.argv.includes('--apply');
const extraSlots = process.argv.includes('--test-append-one') ? 1 : 0;

runSeminarSchedule({ apply, extraSlots })
  .then((result) => {
    console.log(formatResult(result));
    if (result.issues.length) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
