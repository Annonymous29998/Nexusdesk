import { AgentCommandType } from '@nexusdesk/types';
import type { AgentEnv } from './config.js';
import type { Streamer } from './stream.js';
import { createLogger } from './logger.js';
import { captureScreenFrame } from './capture/screen.js';
import { compressFrame } from './capture/encoder.js';
import { handleRemoteInput, lockInput, unlockInput, prepareWindowsInput, type RemoteInputEvent } from './capture/input.js';
import { sendWakeOnLan } from './system/wol.js';
import { runTerminalCommand } from './system/terminal.js';
import { checkForUpdate } from './update.js';

const log = createLogger('commands');

export interface CommandHandlerOptions {
  deviceId: string;
  env: AgentEnv;
  streamer: Streamer;
}

interface AgentCommand {
  id?: string;
  type: string;
  payload?: Record<string, unknown>;
}

export class CommandHandler {
  constructor(private readonly options: CommandHandlerOptions) {}

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
            this.options.streamer.start(sessionId);
          }
          return;
        }
        case 'stop_stream': {
          const sessionId = command.payload?.sessionId
            ? String(command.payload.sessionId)
            : undefined;
          this.options.streamer.stop(sessionId);
          return;
        }
        case 'input': {
          const payload = command.payload as unknown as RemoteInputEvent;
          if (payload?.kind) {
            if (payload.kind !== 'mouse-move') {
              log.info({ kind: payload.kind, x: payload.x, y: payload.y }, 'remote input');
            }
            void handleRemoteInput(payload);
          }
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
