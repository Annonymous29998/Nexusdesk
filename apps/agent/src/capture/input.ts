import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';
import si from 'systeminformation';
import { createLogger } from '../logger.js';

const execFileAsync = promisify(execFile);
const log = createLogger('input');
let locked = false;
let stealthInput = false;
let cursorHidden = false;
let screenSize: { width: number; height: number } | null = null;
let winApi: WinApi | null = null;
let winApiFailed = false;
let loggedInject = false;
let leftHeld = false;
let rightHeld = false;
let middleHeld = false;

export interface RemoteInputEvent {
  kind: string;
  x?: number;
  y?: number;
  button?: string;
  /** Pointer buttons bitmask (1=left, 2=right, 4=middle). */
  buttons?: number;
  deltaY?: number;
  key?: string;
  code?: string;
  text?: string;
  sessionId?: string;
}

interface WinApi {
  SetProcessDPIAware: () => boolean;
  GetSystemMetrics: (n: number) => number;
  SetCursorPos: (x: number, y: number) => boolean;
  ShowCursor: (show: boolean) => number;
  mouse_event: (f: number, dx: number, dy: number, data: number, extra: number) => void;
  keybd_event: (vk: number, scan: number, flags: number, extra: number) => void;
}

/** Prefer physical display metrics so clicks map correctly even when the stream is scaled. */
export function setInputScreenSize(width: number, height: number): void {
  if (width > 0 && height > 0) {
    screenSize = { width, height };
  }
}

/** Sync click coordinates to the real monitor size (not scaled JPEG dimensions). */
export async function syncPhysicalInputScreenSize(): Promise<void> {
  if (platform() !== 'win32') return;
  const api = await loadWinApi();
  if (!api) return;
  api.SetProcessDPIAware();
  setInputScreenSize(Math.max(1, api.GetSystemMetrics(0)), Math.max(1, api.GetSystemMetrics(1)));
}

/** Ensure a visible cursor after a crash or aborted session. */
export async function ensureGuestCursorVisible(): Promise<void> {
  cursorHidden = false;
  if (platform() !== 'win32') return;
  const api = await loadWinApi();
  if (!api) return;
  let count = 0;
  while (api.ShowCursor(true) < 0 && count < 128) count += 1;
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
  Control: 0x11,
  Shift: 0x10,
  Alt: 0x12,
  Meta: 0x5b,
  CapsLock: 0x14,
  Insert: 0x2d,
  F1: 0x70,
  F2: 0x71,
  F3: 0x72,
  F4: 0x73,
  F5: 0x74,
  F6: 0x75,
  F7: 0x76,
  F8: 0x77,
  F9: 0x78,
  F10: 0x79,
  F11: 0x7a,
  F12: 0x7b,
};

const CODE_TO_VK: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (let i = 0; i < 26; i++) {
    map[`Key${String.fromCharCode(65 + i)}`] = 0x41 + i;
  }
  for (let i = 0; i <= 9; i++) {
    map[`Digit${i}`] = 0x30 + i;
  }
  map.ControlLeft = 0x11;
  map.ControlRight = 0x11;
  map.ShiftLeft = 0x10;
  map.ShiftRight = 0x10;
  map.AltLeft = 0x12;
  map.AltRight = 0x12;
  map.MetaLeft = 0x5b;
  map.MetaRight = 0x5c;
  map.Backquote = 0xc0;
  map.Minus = 0xbd;
  map.Equal = 0xbb;
  map.BracketLeft = 0xdb;
  map.BracketRight = 0xdd;
  map.Backslash = 0xdc;
  map.IntlBackslash = 0xdc;
  map.Semicolon = 0xba;
  map.Quote = 0xde;
  map.Comma = 0xbc;
  map.Period = 0xbe;
  map.Slash = 0xbf;
  map.Space = 0x20;
  map.NumpadEnter = 0x0d;
  map.NumpadAdd = 0x6b;
  map.NumpadSubtract = 0x6d;
  map.NumpadMultiply = 0x6a;
  map.NumpadDivide = 0x6f;
  map.NumpadDecimal = 0x6e;
  for (let i = 0; i <= 9; i++) {
    map[`Numpad${i}`] = 0x60 + i;
  }
  return map;
})();

function resolveVirtualKey(key: string, code?: string): number | undefined {
  let vk = WIN_KEY_MAP[key];
  if (vk === undefined && code) vk = CODE_TO_VK[code];
  if (vk === undefined && key.length === 1) {
    vk = key.toUpperCase().charCodeAt(0);
  }
  return vk;
}

const MOUSEEVENTF_MOVE = 0x0001;
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_WHEEL = 0x0800;
const MOUSEEVENTF_ABSOLUTE = 0x8000;

function syncHeldButtons(event: RemoteInputEvent): void {
  if (event.kind === 'mouse-down') {
    if (event.button === 'right') rightHeld = true;
    else if (event.button === 'middle') middleHeld = true;
    else leftHeld = true;
    return;
  }
  if (event.kind === 'mouse-up') {
    if (event.button === 'right') rightHeld = false;
    else if (event.button === 'middle') middleHeld = false;
    else leftHeld = false;
  }
}

function isPointerDragging(event: RemoteInputEvent): boolean {
  if (event.buttons !== undefined && event.buttons > 0) return true;
  return leftHeld || rightHeld || middleHeld;
}

function dragMouseFlags(): number {
  let flags = MOUSEEVENTF_MOVE;
  if (leftHeld) flags |= MOUSEEVENTF_LEFTDOWN;
  if (rightHeld) flags |= MOUSEEVENTF_RIGHTDOWN;
  if (middleHeld) flags |= MOUSEEVENTF_MIDDLEDOWN;
  return flags;
}

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
      ShowCursor: user32.func('int ShowCursor(bool bShow)'),
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

function toAbsolute(
  px: number,
  py: number,
  screenW: number,
  screenH: number,
): { ax: number; ay: number } {
  return {
    ax: Math.round((px / Math.max(1, screenW - 1)) * 65535),
    ay: Math.round((py / Math.max(1, screenH - 1)) * 65535),
  };
}

function absoluteMove(api: WinApi, px: number, py: number, screenW: number, screenH: number): void {
  const { ax, ay } = toAbsolute(px, py, screenW, screenH);
  api.SetCursorPos(px, py);
  api.mouse_event(MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE, ax, ay, 0, 0);
}

async function hideSystemCursor(): Promise<void> {
  const api = await loadWinApi();
  if (!api || cursorHidden) return;
  let count = 0;
  while (api.ShowCursor(false) >= 0 && count < 128) count += 1;
  cursorHidden = true;
  log.info('guest cursor hidden for remote session');
}

async function showSystemCursor(): Promise<void> {
  const api = await loadWinApi();
  if (!api || !cursorHidden) return;
  let count = 0;
  while (api.ShowCursor(true) < 0 && count < 128) count += 1;
  cursorHidden = false;
  log.info('guest cursor restored after remote session');
}

export function setStealthInput(enabled: boolean): void {
  stealthInput = enabled;
}

export async function onRemoteSessionStart(): Promise<void> {
  if (stealthInput && platform() === 'win32') await hideSystemCursor();
}

export async function onRemoteSessionEnd(): Promise<void> {
  leftHeld = false;
  rightHeld = false;
  middleHeld = false;
  if (platform() === 'win32') await showSystemCursor();
}

async function winInjectKoffi(
  event: RemoteInputEvent,
  px: number,
  py: number,
  screenW: number,
  screenH: number,
): Promise<boolean> {
  const api = await loadWinApi();
  if (!api) return false;

  syncHeldButtons(event);

  if (event.kind === 'mouse-move') {
    absoluteMove(api, px, py, screenW, screenH);
    if (isPointerDragging(event)) {
      api.mouse_event(dragMouseFlags(), 0, 0, 0, 0);
    }
  } else if (event.kind === 'mouse-down' || event.kind === 'mouse-up') {
    absoluteMove(api, px, py, screenW, screenH);
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
    absoluteMove(api, px, py, screenW, screenH);
    const delta = Math.round((event.deltaY ?? 0) * -1);
    const wheel = delta === 0 ? 0 : Math.sign(delta) * Math.max(120, Math.abs(delta));
    api.mouse_event(MOUSEEVENTF_WHEEL, 0, 0, wheel, 0);
  }

  if (event.kind === 'key-down' || event.kind === 'key-up') {
    const vk = resolveVirtualKey(event.key ?? '', event.code);
    if (vk !== undefined) {
      const flags = event.kind === 'key-up' ? 0x0002 : 0;
      api.keybd_event(vk, 0, flags, 0);
    } else if (event.code) {
      log.debug({ key: event.key, code: event.code }, 'unmapped key — skipped');
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
    'Add-Type -AssemblyName System.Windows.Forms',
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
  await ensureGuestCursorVisible();
  await loadWinApi();
  await syncPhysicalInputScreenSize();
}

/** Apply a normalised remote input event from the technician viewer. */
export async function handleRemoteInput(event: RemoteInputEvent): Promise<void> {
  if (locked) return;
  syncHeldButtons(event);
  const { width, height } = await getScreenSize();
  const px = Math.max(0, Math.min(width - 1, Math.round((event.x ?? 0) * width)));
  const py = Math.max(0, Math.min(height - 1, Math.round((event.y ?? 0) * height)));

  try {
    if (platform() === 'win32') {
      const ok = await winInjectKoffi(event, px, py, width, height);
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
    if (event.kind === 'key-down' && event.key) {
      const mod = mapRobotModifier(event.key);
      robot.keyToggle(mod ?? event.key, 'down');
    }
    if (event.kind === 'key-up' && event.key) {
      const mod = mapRobotModifier(event.key);
      robot.keyToggle(mod ?? event.key, 'up');
    }
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

function mapRobotModifier(key: string): string | null {
  switch (key) {
    case 'Control':
      return 'control';
    case 'Shift':
      return 'shift';
    case 'Alt':
      return 'alt';
    case 'Meta':
      return 'command';
    default:
      return null;
  }
}

/** Press a key while holding modifiers (e.g. Ctrl+V). */
export async function injectShortcut(key: string, modifiers: string[]): Promise<void> {
  for (const mod of modifiers) {
    await handleRemoteInput({ kind: 'key-down', key: mod });
  }
  await handleRemoteInput({ kind: 'key-down', key });
  await handleRemoteInput({ kind: 'key-up', key });
  for (const mod of [...modifiers].reverse()) {
    await handleRemoteInput({ kind: 'key-up', key: mod });
  }
}
