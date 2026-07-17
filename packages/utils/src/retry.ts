export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default 3. */
  retries?: number;
  /** Initial delay in ms. Default 100. */
  minDelayMs?: number;
  /** Maximum delay in ms. Default 10_000. */
  maxDelayMs?: number;
  /** Exponential factor. Default 2. */
  factor?: number;
  /** Add random jitter up to this fraction of delay. Default 0.2. */
  jitter?: number;
  /** Abort signal to cancel retries. */
  signal?: AbortSignal;
  /** Predicate: return true to retry this error. Default: always retry. */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Called before each retry sleep. */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new Error('Aborted'));
      return;
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new Error('Aborted'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function computeDelay(
  attempt: number,
  minDelayMs: number,
  maxDelayMs: number,
  factor: number,
  jitter: number,
): number {
  const exp = Math.min(maxDelayMs, minDelayMs * factor ** (attempt - 1));
  const jitterAmount = exp * jitter * Math.random();
  return Math.min(maxDelayMs, Math.floor(exp + jitterAmount));
}

/** Retry an async function with exponential backoff and jitter. */
export async function retry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    retries = 3,
    minDelayMs = 100,
    maxDelayMs = 10_000,
    factor = 2,
    jitter = 0.2,
    signal,
    shouldRetry = () => true,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    signal?.throwIfAborted();

    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= retries || !shouldRetry(error, attempt)) {
        throw error;
      }

      const delayMs = computeDelay(attempt, minDelayMs, maxDelayMs, factor, jitter);
      onRetry?.(error, attempt, delayMs);
      await sleep(delayMs, signal);
    }
  }

  throw lastError;
}

export interface TimeoutOptions {
  signal?: AbortSignal;
}

/** Race a promise against a timeout. */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message = `Operation timed out after ${timeoutMs}ms`,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
