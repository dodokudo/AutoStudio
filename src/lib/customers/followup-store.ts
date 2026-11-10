import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { type Followup, validateFollowup } from './followup';
import { readCustomerRecords, writeCustomerRecord } from './store';
const directory = () =>
  path.join(process.cwd(), '.local', 'customer-followups');
const file = (id: string) =>
  path.join(
    directory(),
    createHash('sha256').update(id).digest('hex') + '.json',
  );
export async function readFollowups(): Promise<Record<string, Followup>> {
  if (process.env.NODE_ENV === 'production') return readCustomerRecords<Followup>('followups');
  let files: string[];
  try {
    files = await fs.readdir(directory());
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
  const entries = await Promise.all(
    files
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => {
        const data = JSON.parse(
          await fs.readFile(path.join(directory(), f), 'utf8'),
        );
        return [data.customerId, data.followup] as [string, Followup];
      }),
  );
  return Object.fromEntries(entries);
}
export async function saveFollowup(customerId: string, input: unknown) {
  const now = new Date().toISOString(),
    today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const followup: Followup = {
    ...validateFollowup(input, today),
    updatedAt: now,
  };
  if (process.env.NODE_ENV === 'production') {
    await writeCustomerRecord('followups', customerId, followup);
    return followup;
  }
  await fs.mkdir(directory(), { recursive: true });
  const target = file(customerId),
    temp = target + '.' + randomUUID() + '.tmp';
  await fs.writeFile(temp, JSON.stringify({ customerId, followup }), {
    mode: 0o600,
  });
  await fs.rename(temp, target);
  return followup;
}
