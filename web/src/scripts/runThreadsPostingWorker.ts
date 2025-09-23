import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { processNextJob } from '@/lib/threadsWorker';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const result = await processNextJob();
  if (result.status === 'idle') {
    console.log('No pending jobs.');
  } else if (result.status === 'succeeded') {
    console.log(`Job ${result.jobId} succeeded with thread ${result.postedThreadId}`);
  } else {
    console.error(`Job ${result.jobId} failed: ${result.error}`);
  }
}

main().catch((error) => {
  console.error('Worker crashed', error);
  process.exitCode = 1;
});
