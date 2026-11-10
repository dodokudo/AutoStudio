import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readCustomerRecords, writeCustomerRecord } from './store';
import {
  DEFAULT_SERVICES,
  validateServices,
  type ServiceDefinition,
} from './model';
const file = () => path.join(process.cwd(), '.local', 'customer-services.json');
export async function readServices(): Promise<ServiceDefinition[]> {
  if (process.env.NODE_ENV === 'production') {
    const records = await readCustomerRecords<ServiceDefinition[]>('services');
    return records.catalog ? validateServices(records.catalog) : DEFAULT_SERVICES;
  }
  try {
    return validateServices(JSON.parse(await fs.readFile(file(), 'utf8')));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_SERVICES;
    throw e;
  }
}
export async function saveServices(value: unknown) {
  const services = validateServices(value);
  if (process.env.NODE_ENV === 'production') {
    await writeCustomerRecord('services', 'catalog', services);
    return services;
  }
  await fs.mkdir(path.dirname(file()), { recursive: true });
  const temporary = file() + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(services, null, 2), {
    mode: 0o600,
  });
  await fs.rename(temporary, file());
  return services;
}
