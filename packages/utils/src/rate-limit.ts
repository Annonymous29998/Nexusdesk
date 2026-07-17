export interface RateLimitOptions {
  /** Maximum number of tokens (requests). */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: number;
  retryAfterMs: number;
}

interface Bucket {
  count: number;
  windowStart: number;
}

/**
 * Fixed-window in-memory rate limiter.
 * Suitable for single-process use; pair with Redis for distributed limits.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(options: RateLimitOptions) {
    if (options.limit <= 0) {
      throw new RangeError('limit must be positive');
    }
    if (options.windowMs <= 0) {
      throw new RangeError('windowMs must be positive');
    }
    this.limit = options.limit;
    this.windowMs = options.windowMs;
  }

  consume(key: string, cost = 1): RateLimitResult {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      bucket = { count: 0, windowStart: now };
      this.buckets.set(key, bucket);
    }

    const resetAt = bucket.windowStart + this.windowMs;

    if (bucket.count + cost > this.limit) {
      return {
        allowed: false,
        remaining: Math.max(0, this.limit - bucket.count),
        limit: this.limit,
        resetAt,
        retryAfterMs: Math.max(0, resetAt - now),
      };
    }

    bucket.count += cost;
    return {
      allowed: true,
      remaining: Math.max(0, this.limit - bucket.count),
      limit: this.limit,
      resetAt,
      retryAfterMs: 0,
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  /** Drop expired windows to avoid unbounded growth. */
  prune(now = Date.now()): number {
    let removed = 0;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.windowStart >= this.windowMs) {
        this.buckets.delete(key);
        removed += 1;
      }
    }
    return removed;
  }
}

/** Create a rate-limit check function bound to a limiter. */
export function createRateLimit(options: RateLimitOptions): (key: string, cost?: number) => RateLimitResult {
  const limiter = new RateLimiter(options);
  return (key, cost = 1) => limiter.consume(key, cost);
}
