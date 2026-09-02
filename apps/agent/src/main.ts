import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { WS_EVENTS } from '@nexusdesk/shared';
import {
  AGENT_VERSION,
  clearRuntimeState,
  getDataDir,
  loadEnv,
  loadRuntimeState,
  resolveAgentWsUrl,
  saveRuntimeState,
  shouldReenroll,
  type AgentEnv,
} from './config.js';
import {
  AgentAuthStore,
  getOrCreateDeviceKeyPair,
  resolveEncryptionKey,
  type AgentTokens,
} from './auth.js';
import { enrollDevice } from './enroll.js';
import { AgentConnection } from './connection.js';
import { HeartbeatService } from './heartbeat.js';
import { CommandHandler } from './commands.js';
import { Streamer } from './stream.js';
import { WebRtcStreamer } from './webrtc/video-stream.js';
import {
  getStaticSystemInfo,
  listLocalIpAddresses,
  sampleDiskUsage,
  sampleRuntime,
} from './system/info.js';
import { acquireSingleInstance, releaseSingleInstance } from './single-instance.js';
import { createLogger } from './logger.js';
import { ensureGuestCursorVisible, type RemoteInputEvent } from './capture/input.js';
import { maybeRefreshDeviceToken } from './refresh-token.js';

const log = createLogger('agent');

function pidFilePath(): string {
  return join(getDataDir(), 'agent.pid');
}

function writePidFile(): void {
  try {
    writeFileSync(pidFilePath(), String(process.pid), { mode: 0o644 });
  } catch (err) {
    log.warn({ err }, 'could not write agent.pid');
  }
}

function clearPidFile(): void {
  try {
    unlinkSync(pidFilePath());
  } catch {
    /* ignore */
  }
}

async function bootstrap(env: AgentEnv): Promise<void> {
  const soleOwner = await acquireSingleInstance();
  if (!soleOwner) {
    log.error('exiting — another NexusDesk agent is already running');
    process.exit(0);
  }
  writePidFile();

  const key = resolveEncryptionKey(env.ENCRYPTION_KEY);
  const auth = new AgentAuthStore(env.ENCRYPTION_KEY);
  const keyPair = getOrCreateDeviceKeyPair(key);
  const info = getStaticSystemInfo();

  let state = loadRuntimeState();
  let tokens = auth.load();

  const enrollmentToken = env.AGENT_ENROLLMENT_TOKEN ?? env.AGENT_ENROLLMENT_SECRET;
  const guestCode =
    env.GUEST_CODE ??
    (enrollmentToken && /^[A-Za-z0-9]{6,12}$/.test(enrollmentToken) ? enrollmentToken : undefined);

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
      wsUrl: resolveAgentWsUrl(enrolled.wsUrl || env.WS_URL, env.WS_URL),
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

  const wsBase = resolveAgentWsUrl(state.wsUrl, env.WS_URL);
  if (wsBase !== state.wsUrl.replace(/\/$/, '').replace(/\/ws$/, '')) {
    state = { ...state, wsUrl: wsBase };
    saveRuntimeState(state);
    log.info({ wsUrl: wsBase }, 'migrated agent WebSocket URL');
  }

  let activeTokens: AgentTokens = tokens!;

  const refreshTokens = async (): Promise<string | null> => {
    const refreshed = await maybeRefreshDeviceToken(env, auth, activeTokens);
    activeTokens = refreshed;
    return refreshed.deviceToken;
  };

  const streamer = new Streamer({
    fps: env.AGENT_CAPTURE_FPS,
    quality: env.AGENT_CAPTURE_QUALITY,
    maxWidth: env.AGENT_CAPTURE_MAX_WIDTH,
    stealthInput: env.AGENT_STEALTH_INPUT,
    send: (sessionId, frame) => connection.sendFrame(sessionId, frame),
    isBackpressured: () => connection.isBackpressured(),
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
  const webrtc: WebRtcStreamer = new WebRtcStreamer({
    fps: Math.min(30, env.AGENT_CAPTURE_FPS),
    maxWidth: env.AGENT_CAPTURE_MAX_WIDTH,
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    sendSignal: (event, data) => connection.sendSignal(event, data),
    joinSession: (sessionId) => connection.joinSession(sessionId),
    onInput: (payload) => {
      try {
        void commandHandler.handleInput(payload);
      } catch {
        /* keep agent alive on bad input */
      }
    },
    onVideoReady: (sessionId) => {
      commandHandler.markWebrtcHealthy(sessionId);
    },
    onFailed: (sessionId) => {
      commandHandler.markWebrtcFailed(sessionId);
    },
  });
  const commandHandler: CommandHandler = new CommandHandler({
    deviceId: state.deviceId,
    env,
    streamer,
    webrtc,
    sendClipboard: (sessionId, text) => connection.sendClipboard(sessionId, text),
    onStreamError: (sessionId, message) => {
      connection.sendScreenStatus({
        sessionId,
        deviceOnline: true,
        captureError: message,
      });
    },
  });
  const connection: AgentConnection = new AgentConnection({
    wsUrl: (() => {
      const base = wsBase.replace(/\/$/, '');
      return base.endsWith('/ws') ? base : `${base}/ws`;
    })(),
    getToken: () => auth.load()?.deviceToken ?? activeTokens.deviceToken,
    onAuthError: refreshTokens,
    maxReconnectDelayMs: env.AGENT_MAX_RECONNECT_DELAY_MS,
    onCommand: (command) => commandHandler.handle(command),
    onInput: (data) => {
      try {
        void commandHandler.handleInput(data as unknown as RemoteInputEvent);
      } catch {
        /* keep agent alive on bad input */
      }
    },
    onSignal: (event, data) => {
      const sessionId = String(data.sessionId ?? '');
      if (!sessionId || !webrtc) return;
      if (event === WS_EVENTS.signalAnswer && typeof data.sdp === 'string') {
        void webrtc.handleAnswer(sessionId, data.sdp);
        return;
      }
      if (event === WS_EVENTS.signalRenegotiate) {
        void webrtc.handleRenegotiate(sessionId);
        return;
      }
      if (event === WS_EVENTS.signalIce && typeof data.candidate === 'string') {
        void webrtc.handleIceCandidate(
          sessionId,
          data.candidate,
          typeof data.sdpMid === 'string' ? data.sdpMid : null,
          typeof data.sdpMLineIndex === 'number' ? data.sdpMLineIndex : null,
        );
      }
    },
  });

  // Stream session IDs survive brief reconnects; server re-sends start_stream on register.

  const heartbeat = new HeartbeatService({
    intervalMs: state.heartbeatIntervalMs || env.AGENT_HEARTBEAT_INTERVAL_MS,
    send: (payload) => connection.sendHeartbeat(payload),
    collect: async () => {
      const [runtime, disk, ipAddresses] = await Promise.all([
        Promise.resolve(sampleRuntime()),
        sampleDiskUsage(),
        listLocalIpAddresses(),
      ]);
      return {
        agentVersion: AGENT_VERSION,
        metadata: {
          hostname: info.hostname,
          platform: info.platform,
          osVersion: info.osVersion,
          metrics: {
            cpuPercent: runtime.cpuPercent,
            memoryUsedMb: runtime.memoryUsedMb,
            memoryTotalMb: runtime.memoryTotalMb,
            diskUsedMb: disk.diskUsedMb,
            diskTotalMb: disk.diskTotalMb,
            uptimeSeconds: runtime.uptimeSeconds,
            ipAddresses,
            sampledAt: new Date().toISOString(),
          },
        },
      };
    },
  });

  connection.onAuthenticated(() => {
    heartbeat.start();
  });

  connection.onDisconnected(() => {
    heartbeat.stop();
  });

  await ensureGuestCursorVisible();
  activeTokens = await maybeRefreshDeviceToken(env, auth, activeTokens);
  await connection.connect();
  log.info({ deviceId: state.deviceId }, 'agent online');

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'shutting down');
    heartbeat.stop();
    streamer.stop();
    webrtc?.stop();
    await ensureGuestCursorVisible();
    await connection.close();
    clearPidFile();
    await releaseSingleInstance();
    process.exit(0);
  };

  // Soft stop for guest reinstalls (avoids taskkill/schtasks which antivirus flags).
  const stopFile = join(getDataDir(), 'stop.request');
  const stopWatcher = setInterval(() => {
    if (!existsSync(stopFile)) return;
    try {
      unlinkSync(stopFile);
    } catch {
      /* ignore */
    }
    void shutdown('stop.request');
  }, 1000);
  stopWatcher.unref?.();

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
