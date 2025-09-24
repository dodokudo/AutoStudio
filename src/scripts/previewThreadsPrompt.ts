import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { buildThreadsPromptPayload } from '../lib/promptBuilder';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const projectId = process.env.BQ_PROJECT_ID || 'mark-454114';
  const payload = await buildThreadsPromptPayload({ projectId });
  console.log(JSON.stringify(payload, null, 2));
}

main().catch((error) => {
  console.error('Failed to build prompt payload:', error);
  process.exitCode = 1;
});
