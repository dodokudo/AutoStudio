import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_SERVICES,
  validateServices,
  type ServiceDefinition,
} from './model';
const file = () => path.join(process.cwd(), '.local', 'customer-services.json');
export async function readServices(): Promise<ServiceDefinition[]> {
  if (process.env.NODE_ENV === 'production') return DEFAULT_SERVICES;
  try {
    return validateServices(JSON.parse(await fs.readFile(file(), 'utf8')));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULT_SERVICES;
    throw e;
  }
}
export async function saveServices(value: unknown) {
  if (process.env.NODE_ENV === 'production')
    throw Error('サービス設定の保存はローカル確認版のみ対応しています');
  const services = validateServices(value);
  await fs.mkdir(path.dirname(file()), { recursive: true });
  const temporary = file() + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(services, null, 2), {
    mode: 0o600,
  });
  await fs.rename(temporary, file());
  return services;
}
