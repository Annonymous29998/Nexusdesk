import { AGENT_VERSION, clearRuntimeState, loadEnv, loadRuntimeState, saveRuntimeState, shouldReenroll, type AgentEnv } from './config.js';
import { AgentAuthStore, getOrCreateDeviceKeyPair, resolveEncryptionKey } from './auth.js';
import { enrollDevice } from './enroll.js';
import { AgentConnection } from './connection.js';
import { HeartbeatService } from './heartbeat.js';
import { CommandHandler } from './commands.js';
import { Streamer } from './stream.js';
import { getStaticSystemInfo } from './system/info.js';
import { acquireSingleInstance, releaseSingleInstance } from './single-instance.js';
import { createLogger } from './logger.js';

const log = createLogger('agent');

async function bootstrap(env: AgentEnv): Promise<void> {
  const soleOwner = await acquireSingleInstance();
  if (!soleOwner) {
    log.error('exiting — another NexusDesk agent is already running');
    process.exit(0);
  }

  const key = resolveEncryptionKey(env.ENCRYPTION_KEY);
  const auth = new AgentAuthStore(env.ENCRYPTION_KEY);
  const keyPair = getOrCreateDeviceKeyPair(key);
  const info = getStaticSystemInfo();

  let state = loadRuntimeState();
  let tokens = auth.load();

  const enrollmentToken = env.AGENT_ENROLLMENT_TOKEN ?? env.AGENT_ENROLLMENT_SECRET;
  const guestCode = env.GUEST_CODE ?? (
    enrollmentToken && /^[A-Za-z0-9]{6,12}$/.test(enrollmentToken) ? enrollmentToken : undefined
  );

  if (shouldReenroll(state, Boolean(tokens), guestCode)) {
    log.info({ guestCode: guestCode ?? null, hadState: Boolean(state) }, 're-enrollment required');
    clearRuntimeState();
    auth.clear();
    state = null;
    tokens = null;
  }

  if (!state || !tokens) {
    if (!enrollmentToken && !guestCode) {
      throw new Error('Agent is not enrolled. Set AGENT_ENROLLMENT_TOKEN or GUEST_CODE.');
    }

    log.info({ hostname: info.hostname, guestCode: guestCode ?? null }, 'enrolling device');
    const enrolled = await enrollDevice({
      apiUrl: env.API_URL,
      enrollmentToken: guestCode ? undefined : enrollmentToken,
      guestCode,
      hostname: info.hostname,
      platform: info.platform,
      osVersion: info.osVersion,
      agentVersion: AGENT_VERSION,
      publicKey: keyPair.publicKeyBase64,
      metadata: {
        arch: info.arch,
        cpuModel: info.cpuModel,
        totalMemoryMb: String(info.totalMemoryMb),
      },
    });

    state = {
      deviceId: enrolled.deviceId,
      organizationId: enrolled.organizationId,
      heartbeatIntervalMs: enrolled.heartbeatIntervalMs,
      wsUrl: enrolled.wsUrl || env.WS_URL,
      enrolledAt: new Date().toISOString(),
      agentVersion: AGENT_VERSION,
      guestCode: guestCode?.toUpperCase(),
    };
    saveRuntimeState(state);
    tokens = {
      deviceToken: enrolled.deviceToken,
      refreshToken: enrolled.refreshToken,
      issuedAt: new Date().toISOString(),
    };
    auth.save(tokens);
    log.info({ deviceId: state.deviceId }, 'enrollment complete');
  }

  let connection: AgentConnection;
  const streamer = new Streamer({
    fps: env.AGENT_CAPTURE_FPS,
    quality: env.AGENT_CAPTURE_QUALITY,
    send: (sessionId, frame) => connection.sendFrame(sessionId, frame),
    onCaptureError: (message, sessionIds) => {
      for (const sessionId of sessionIds) {
        connection.sendScreenStatus({
          sessionId,
          deviceOnline: true,
          captureError: message,
        });
      }
    },
  });
  const commands = new CommandHandler({ deviceId: state.deviceId, env, streamer });
  connection = new AgentConnection({
    wsUrl: state.wsUrl.replace(/\/$/, '') + '/ws',
    getToken: () => auth.load()?.deviceToken ?? tokens!.deviceToken,
    maxReconnectDelayMs: env.AGENT_MAX_RECONNECT_DELAY_MS,
    onCommand: (command) => commands.handle(command),
  });

  // Stream session IDs survive brief reconnects; server re-sends start_stream on register.

  const heartbeat = new HeartbeatService({
    intervalMs: state.heartbeatIntervalMs || env.AGENT_HEARTBEAT_INTERVAL_MS,
    send: (payload) => connection.sendHeartbeat(payload),
    collect: async () => ({
      agentVersion: AGENT_VERSION,
      metadata: {
        hostname: info.hostname,
        platform: info.platform,
        osVersion: info.osVersion,
      },
    }),
  });

  connection.onAuthenticated(() => {
    heartbeat.start();
  });

  connection.onDisconnected(() => {
    heartbeat.stop();
  });

  await connection.connect();
  log.info({ deviceId: state.deviceId }, 'agent online');

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'shutting down');
    heartbeat.stop();
    streamer.stop();
    await connection.close();
    await releaseSingleInstance();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

async function main(): Promise<void> {
  const env = loadEnv();
  try {
    await bootstrap(env);
  } catch (err) {
    log.error({ err }, 'fatal agent error');
    process.exit(1);
  }
}

void main();
