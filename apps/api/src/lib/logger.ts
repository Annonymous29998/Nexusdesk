import pino from 'pino';
import type { Env } from '../config/env.js';
import { getEnv } from '../config/env.js';

export function createLoggerOptions(env: Env) {
  const isDev = env.NODE_ENV === 'development';
  // pino-pretty runs in a worker thread that can deadlock when stdout is not a
  // TTY (e.g. the process is backgrounded or piped). Only enable it for an
  // interactive terminal; otherwise emit plain JSON logs.
  const usePretty = isDev && process.stdout.isTTY;
  return {
    level: env.LOG_LEVEL,
    transport: usePretty
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:standard' } }
      : undefined,
  };
}

export function createLogger(name: string) {
  const env = getEnv();
  return pino({
    ...createLoggerOptions(env),
    name,
  });
}
