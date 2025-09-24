import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { updateTemplateScores } from '@/lib/templateScores';

loadEnv();
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });

async function main() {
  const result = await updateTemplateScores();
  console.log(`Inserted ${result.inserted} template score rows.`);
}

main().catch((error) => {
  console.error('Template score update failed', error);
  process.exitCode = 1;
});
