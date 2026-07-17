import pino from 'pino';
import { loadEnv } from './config.js';

export function createLogger(name: string) {
  const env = loadEnv();
  // pino-pretty runs in a worker thread that can deadlock with no TTY (the
  // agent runs as a background service/scheduled task). Only use it for an
  // interactive terminal; otherwise emit plain JSON.
  const usePretty = env.NODE_ENV === 'development' && Boolean(process.stdout.isTTY);
  return pino({
    name,
    level: env.LOG_LEVEL,
    transport: usePretty ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  });
}
