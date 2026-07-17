import { loadEnv } from './config/env.js';
import { buildApp } from './app.js';

async function main() {
  const env = loadEnv();
  const app = await buildApp();

  try {
    await app.listen({ host: env.HOST, port: env.PORT });
    app.log.info(`NexusDesk API listening on ${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
