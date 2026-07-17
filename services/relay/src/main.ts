import { loadEnv } from './env.js';
import { buildRelayServer } from './server.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = buildRelayServer(env);

  try {
    await app.listen({ host: env.RELAY_HOST, port: env.RELAY_PORT });
    app.log.info({ host: env.RELAY_HOST, port: env.RELAY_PORT }, '@nexusdesk/relay listening');
  } catch (error) {
    app.log.error({ err: error }, 'failed to start relay server');
    process.exit(1);
  }

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down @nexusdesk/relay');

    app
      .close()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        app.log.error({ err: error }, 'error during shutdown');
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error('Fatal error starting @nexusdesk/relay:', error);
  process.exit(1);
});
