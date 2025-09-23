import { CookieExpiredError } from './errors';

interface RetryOptions {
  maxAttempts: number;
  delaysMs: number[];
  onRetry?: (error: unknown, attempt: number) => Promise<void> | void;
}

export async function withRetries<T>(
  task: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { maxAttempts, delaysMs, onRetry } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await task(attempt);
    } catch (error) {
      if (error instanceof CookieExpiredError) {
        throw error;
      }

      if (attempt === maxAttempts) {
        throw error;
      }

      if (onRetry) {
        await onRetry(error, attempt);
      }

      const delayMs = delaysMs[attempt - 1] ?? delaysMs[delaysMs.length - 1] ?? 0;
      if (delayMs > 0) {
        await delay(delayMs);
      }
    }
  }

  throw new Error('Retry loop exited unexpectedly');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
