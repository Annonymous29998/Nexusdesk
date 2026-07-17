import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';
import si from 'systeminformation';
import { createLogger } from '../logger.js';

const execFileAsync = promisify(execFile);
const log = createLogger('input');
let locked = false;
let screenSize: { width: number; height: number } | null = null;
let winApi: WinApi | null = null;
let winApiFailed = false;
let loggedInject = false;

export interface RemoteInputEvent {
  kind: string;
  x?: number;
  y?: number;
  button?: string;
  deltaY?: number;
  key?: string;
}

interface WinApi {
  SetProcessDPIAware: () => boolean;
  GetSystemMetrics: (n: number) => number;
  SetCursorPos: (x: number, y: number) => boolean;
  mouse_event: (f: number, dx: number, dy: number, data: number, extra: number) => void;
  keybd_event: (vk: number, scan: number, flags: number, extra: number) => void;
}

/** Prefer capture dimensions so clicks map to the same pixels as the stream. */
export function setInputScreenSize(width: number, height: number): void {
  if (width > 0 && height > 0) {
    screenSize = { width, height };
  }
}

async function getScreenSize(): Promise<{ width: number; height: number }> {
  if (screenSize) return screenSize;
  try {
    if (platform() === 'win32') {
      const api = await loadWinApi();
      if (api) {
        api.SetProcessDPIAware();
        screenSize = {
          width: Math.max(1, api.GetSystemMetrics(0)),
          height: Math.max(1, api.GetSystemMetrics(1)),
        };
        return screenSize;
      }
    }
    const graphics = await si.graphics();
    const primary = graphics.displays.find((d) => d.main) ?? graphics.displays[0];
    screenSize = {
      width: primary?.resolutionX ?? 1920,
      height: primary?.resolutionY ?? 1080,
    };
  } catch {
    screenSize = { width: 1920, height: 1080 };
  }
  return screenSize;
}

const WIN_KEY_MAP: Record<string, number> = {
  Enter: 0x0d,
  Escape: 0x1b,
  Backspace: 0x08,
  Tab: 0x09,
  Delete: 0x2e,
  ArrowUp: 0x26,
  ArrowDown: 0x28,
  ArrowLeft: 0x25,
  ArrowRight: 0x27,
  Home: 0x24,
  End: 0x23,
  PageUp: 0x21,
  PageDown: 0x22,
  ' ': 0x20,
};

const MOUSEEVENTF_MOVE = 0x0001;
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_WHEEL = 0x0800;
const MOUSEEVENTF_ABSOLUTE = 0x8000;

async function loadWinApi(): Promise<WinApi | null> {
  if (winApi) return winApi;
  if (winApiFailed || platform() !== 'win32') return null;
  try {
    const koffi = (await import('koffi')).default;
    const user32 = koffi.load('user32.dll');
    winApi = {
      SetProcessDPIAware: user32.func('bool SetProcessDPIAware()'),
      GetSystemMetrics: user32.func('int GetSystemMetrics(int nIndex)'),
      SetCursorPos: user32.func('bool SetCursorPos(int X, int Y)'),
      mouse_event: user32.func(
        'void mouse_event(uint32 dwFlags, uint32 dx, uint32 dy, uint32 dwData, uintptr dwExtraInfo)',
      ),
      keybd_event: user32.func(
        'void keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr dwExtraInfo)',
      ),
    };
    winApi.SetProcessDPIAware();
    log.info('win32 input via koffi/user32 ready');
    return winApi;
  } catch (err) {
    winApiFailed = true;
    log.warn({ err }, 'koffi user32 load failed — will use PowerShell fallback');
    return null;
  }
}

function absoluteMove(api: WinApi, px: number, py: number): void {
  const w = Math.max(1, api.GetSystemMetrics(0) - 1);
  const h = Math.max(1, api.GetSystemMetrics(1) - 1);
  const ax = Math.round((px * 65535) / w);
  const ay = Math.round((py * 65535) / h);
  api.SetCursorPos(px, py);
  api.mouse_event(MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE, ax, ay, 0, 0);
}

async function winInjectKoffi(event: RemoteInputEvent, px: number, py: number): Promise<boolean> {
  const api = await loadWinApi();
  if (!api) return false;

  if (event.kind === 'mouse-move' || event.kind === 'mouse-down' || event.kind === 'mouse-up') {
    absoluteMove(api, px, py);
  }

  if (event.kind === 'mouse-down' || event.kind === 'mouse-up') {
    const down = event.kind === 'mouse-down';
    const btn = event.button ?? 'left';
    const flag =
      btn === 'right'
        ? down
          ? MOUSEEVENTF_RIGHTDOWN
          : MOUSEEVENTF_RIGHTUP
        : btn === 'middle'
          ? down
            ? MOUSEEVENTF_MIDDLEDOWN
            : MOUSEEVENTF_MIDDLEUP
          : down
            ? MOUSEEVENTF_LEFTDOWN
            : MOUSEEVENTF_LEFTUP;
    api.mouse_event(flag, 0, 0, 0, 0);
  }

  if (event.kind === 'wheel') {
    absoluteMove(api, px, py);
    const delta = Math.round((event.deltaY ?? 0) * -1);
    const wheel = delta === 0 ? 0 : Math.sign(delta) * Math.max(120, Math.abs(delta));
    api.mouse_event(MOUSEEVENTF_WHEEL, 0, 0, wheel, 0);
  }

  if (event.kind === 'key-down' || event.kind === 'key-up') {
    const key = event.key ?? '';
    let vk = WIN_KEY_MAP[key];
    if (vk === undefined && key.length === 1) {
      vk = key.toUpperCase().charCodeAt(0);
    }
    if (vk !== undefined) {
      const flags = event.kind === 'key-up' ? 0x0002 : 0;
      api.keybd_event(vk, 0, flags, 0);
    }
  }

  if (!loggedInject && (event.kind === 'mouse-down' || event.kind === 'mouse-move')) {
    loggedInject = true;
    log.info({ kind: event.kind, px, py }, 'first win32 input injected');
  }
  return true;
}

/** Last-resort one-shot PowerShell (clicks only — too slow for moves). */
async function winInjectPowerShell(event: RemoteInputEvent, px: number, py: number): Promise<void> {
  if (event.kind === 'mouse-move') return;
  const down = event.kind === 'mouse-down';
  const btn = event.button ?? 'left';
  const downFlag = btn === 'right' ? 8 : btn === 'middle' ? 32 : 2;
  const upFlag = btn === 'right' ? 16 : btn === 'middle' ? 64 : 4;
  const flag = down ? downFlag : upFlag;
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -TypeDefinition @'",
    'using System;using System.Runtime.InteropServices;',
    'public class NdClick {',
    '  [DllImport("user32.dll")] public static extern void mouse_event(int f,int dx,int dy,int d,int e);',
    '}',
    "'@",
    `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${px},${py})`,
    event.kind === 'mouse-down' || event.kind === 'mouse-up'
      ? `[NdClick]::mouse_event(${flag},0,0,0,0)`
      : '',
  ]
    .filter(Boolean)
    .join('; ');
  await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', script],
    { windowsHide: true, timeout: 5000 },
  );
}

export async function prepareWindowsInput(): Promise<void> {
  if (platform() !== 'win32') return;
  await loadWinApi();
}

/** Apply a normalised remote input event from the technician viewer. */
export async function handleRemoteInput(event: RemoteInputEvent): Promise<void> {
  if (locked) return;
  const { width, height } = await getScreenSize();
  const px = Math.max(0, Math.min(width - 1, Math.round((event.x ?? 0) * width)));
  const py = Math.max(0, Math.min(height - 1, Math.round((event.y ?? 0) * height)));

  try {
    if (platform() === 'win32') {
      const ok = await winInjectKoffi(event, px, py);
      if (!ok) await winInjectPowerShell(event, px, py);
      return;
    }
    const robot = await import('robotjs').then((m) => m.default).catch(() => null);
    if (!robot) return;
    if (event.kind === 'mouse-move' || event.kind === 'mouse-down' || event.kind === 'mouse-up') {
      robot.moveMouse(px, py);
    }
    if (event.kind === 'mouse-down') robot.mouseToggle('down', event.button ?? 'left');
    if (event.kind === 'mouse-up') robot.mouseToggle('up', event.button ?? 'left');
    if (event.kind === 'key-down' && event.key) robot.keyToggle(event.key, 'down');
    if (event.kind === 'key-up' && event.key) robot.keyToggle(event.key, 'up');
  } catch (err) {
    log.warn({ err, kind: event.kind }, 'input injection failed');
  }
}

export async function lockInput(): Promise<void> {
  locked = true;
  log.info({ locked }, 'keyboard/mouse lock state updated');
}

export async function unlockInput(): Promise<void> {
  locked = false;
  log.info({ locked }, 'keyboard/mouse unlock state updated');
}

export function isInputLocked(): boolean {
  return locked;
}

export async function injectMouseMove(x: number, y: number): Promise<void> {
  await handleRemoteInput({ kind: 'mouse-move', x, y });
}

export async function injectKeyTap(key: string): Promise<void> {
  await handleRemoteInput({ kind: 'key-down', key });
  await handleRemoteInput({ kind: 'key-up', key });
}
