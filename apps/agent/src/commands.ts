import { AgentCommandType } from '@nexusdesk/types';
import type { AgentEnv } from './config.js';
import type { Streamer } from './stream.js';
import type { WebRtcStreamer } from './webrtc/video-stream.js';
import { createLogger } from './logger.js';
import { captureScreenFrame } from './capture/screen.js';
import { compressFrame } from './capture/encoder.js';
import {
  handleRemoteInput,
  lockInput,
  unlockInput,
  prepareWindowsInput,
  type RemoteInputEvent,
} from './capture/input.js';
import { getRemoteClipboardText, pasteToRemoteClipboard } from './capture/clipboard.js';
import { sendWakeOnLan } from './system/wol.js';
import { runTerminalCommand } from './system/terminal.js';
import { checkForUpdate } from './update.js';

const log = createLogger('commands');

export interface CommandHandlerOptions {
  deviceId: string;
  env: AgentEnv;
  streamer: Streamer;
  webrtc?: WebRtcStreamer;
  sendClipboard: (sessionId: string, text: string) => void;
  onStreamError?: (sessionId: string, message: string) => void;
}

interface AgentCommand {
  id?: string;
  type: string;
  payload?: Record<string, unknown>;
}

export class CommandHandler {
  constructor(private readonly options: CommandHandlerOptions) {}

  async handleInput(payload: RemoteInputEvent): Promise<void> {
    if (!payload?.kind) return;
    if (payload.kind === 'clipboard-paste') {
      const text = String(payload.text ?? '');
      if (text) await pasteToRemoteClipboard(text);
      return;
    }
    if (payload.kind === 'clipboard-pull') {
      const text = await getRemoteClipboardText();
      const sessionId = String(payload.sessionId ?? '');
      if (sessionId) this.options.sendClipboard(sessionId, text);
      return;
    }
    void handleRemoteInput(payload);
    if (this.options.env.AGENT_STREAM_MODE === 'jpeg') {
      this.options.streamer.requestRefresh(payload.kind, payload.buttons);
    }
  }

  async handle(raw: unknown): Promise<void> {
    const command = raw as AgentCommand;
    const type = command.type;
    log.info({ type, id: command.id }, 'received command');

    try {
      switch (type) {
        case AgentCommandType.Ping:
          return;
        case AgentCommandType.CaptureScreenshot: {
          const frame = await captureScreenFrame();
          const compressed = await compressFrame(frame, this.options.env.AGENT_CAPTURE_QUALITY);
          log.info({ bytes: compressed.length }, 'screenshot captured');
          return;
        }
        case AgentCommandType.LockInput:
          await lockInput();
          return;
        case AgentCommandType.UnlockInput:
          await unlockInput();
          return;
        case AgentCommandType.Restart:
          log.warn('restart requested — initiate OS reboot via service manager');
          return;
        case AgentCommandType.SelfUpdate:
          await checkForUpdate(this.options.env);
          return;
        case AgentCommandType.UpdateConfig:
          log.info({ payload: command.payload }, 'config update applied in-memory');
          return;
        case AgentCommandType.StartSession:
        case AgentCommandType.EndSession:
          log.info({ type, payload: command.payload }, 'session lifecycle command acknowledged');
          return;
        case 'start_stream': {
          const sessionId = String(command.payload?.sessionId ?? '');
          if (sessionId) {
            void prepareWindowsInput();
            const mode = this.options.env.AGENT_STREAM_MODE;
            if (mode === 'jpeg') {
              this.options.streamer.start(sessionId);
              return;
            }
            const webrtcStarted = this.options.webrtc
              ? await this.options.webrtc.start(sessionId)
              : false;
            if (!webrtcStarted) {
              const message =
                'WebRTC unavailable on guest PC — reinstall the support agent (v0.1.22+).';
              log.error({ sessionId }, message);
              this.options.onStreamError?.(sessionId, message);
            }
          }
          return;
        }
        case 'stop_stream': {
          const sessionId = command.payload?.sessionId
            ? String(command.payload.sessionId)
            : undefined;
          this.options.webrtc?.stop(sessionId);
          this.options.streamer.stop(sessionId);
          return;
        }
        case 'input': {
          const payload = command.payload as unknown as RemoteInputEvent;
          await this.handleInput(payload);
          return;
        }
        case 'wake_on_lan': {
          const mac = String(command.payload?.mac ?? '');
          if (mac) await sendWakeOnLan(mac);
          return;
        }
        case 'terminal_exec': {
          const cmd = String(command.payload?.command ?? '');
          if (cmd) await runTerminalCommand(cmd);
          return;
        }
        default:
          log.warn({ type }, 'unknown command');
      }
    } catch (err) {
      log.error({ err, type }, 'command failed');
    }
  }
}
