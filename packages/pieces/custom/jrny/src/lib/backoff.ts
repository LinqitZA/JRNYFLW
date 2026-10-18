import { JrnyApiError } from './client';

// JRNY rate-limits bursts and its window can be a minute; the client does not keep Retry-After, so the waits add up to just over a minute.
async function withBackoff<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (!(err instanceof JrnyApiError) || err.httpStatus !== 429 || attempt >= BACKOFF_SECONDS.length) throw err;
      await new Promise((resolve) => setTimeout(resolve, BACKOFF_SECONDS[attempt] * 1000));
    }
  }
}

export const jrnyBackoff = { withBackoff };

const BACKOFF_SECONDS = [2, 4, 8, 16, 32];
