import { createRateLimit } from '@nexusdesk/utils';
import type { Redis } from 'ioredis';
import { getEnv } from '../config/env.js';
import { AppError } from '../domain/errors/app-error.js';

function key(prefix: string, id: string): string {
  return `bf:${prefix}:${id}`;
}

export class BruteForceGuard {
  private readonly memory: ReturnType<typeof createRateLimit>;

  constructor(private readonly redis: Redis | null) {
    const env = getEnv();
    this.memory = createRateLimit({
      limit: env.RATE_LIMIT_AUTH_MAX,
      windowMs: env.RATE_LIMIT_WINDOW_MS,
    });
  }

  async assertAllowed(bucket: string, id: string): Promise<void> {
    const env = getEnv();
    const redisKey = key(bucket, id);

    if (this.redis && this.redis.status === 'ready') {
      const count = await this.redis.incr(redisKey);
      if (count === 1) {
        await this.redis.pexpire(redisKey, env.RATE_LIMIT_WINDOW_MS);
      }
      if (count > env.RATE_LIMIT_AUTH_MAX) {
        throw AppError.tooMany('Too many authentication attempts. Try again later.');
      }
      return;
    }

    const result = this.memory(`${bucket}:${id}`);
    if (!result.allowed) {
      throw AppError.tooMany('Too many authentication attempts. Try again later.');
    }
  }

  async reset(bucket: string, id: string): Promise<void> {
    if (this.redis && this.redis.status === 'ready') {
      await this.redis.del(key(bucket, id));
    }
  }
}
