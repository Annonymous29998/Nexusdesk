import { loadEnv } from './env.js';
import { buildSignalingServer } from './server.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const { app, close } = buildSignalingServer(env);

  try {
    await app.listen({ host: env.SIGNALING_HOST, port: env.SIGNALING_PORT });
    app.log.info(
      { host: env.SIGNALING_HOST, port: env.SIGNALING_PORT },
      '@nexusdesk/signaling listening',
    );
  } catch (error) {
    app.log.error({ err: error }, 'failed to start signaling server');
    process.exit(1);
  }

  let shuttingDown = false;
  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info({ signal }, 'shutting down @nexusdesk/signaling');

    close()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        app.log.error({ err: error }, 'error during shutdown');
        process.exit(1);
      });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'unhandled rejection');
  });
}

main().catch((error: unknown) => {
  console.error('Fatal error starting @nexusdesk/signaling:', error);
  process.exit(1);
});
