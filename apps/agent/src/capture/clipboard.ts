import { execFile, spawn } from 'node:child_process';
import { platform } from 'node:os';
import { promisify } from 'node:util';
import { injectShortcut } from './input.js';

const execFileAsync = promisify(execFile);

/** Read text from the guest OS clipboard. */
export async function getRemoteClipboardText(): Promise<string> {
  if (platform() !== 'win32') {
    try {
      const robot = await import('robotjs').then((m) => m.default);
      return robot.getClipboard() ?? '';
    } catch {
      return '';
    }
  }

  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-STA', '-Command', 'Get-Clipboard -Format Text -Raw'],
      { windowsHide: true, timeout: 5000, maxBuffer: 4 * 1024 * 1024 },
    );
    return stdout.replace(/\r?\n$/, '');
  } catch {
    return '';
  }
}

/** Write text to the guest OS clipboard. */
export async function setRemoteClipboardText(text: string): Promise<void> {
  if (platform() !== 'win32') {
    try {
      const robot = await import('robotjs').then((m) => m.default);
      robot.setClipboard(text);
    } catch {
      /* ignore */
    }
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-STA', '-Command', '$input | Set-Clipboard -AsPlainText'],
      { windowsHide: true },
    );
    ps.stdin.write(text);
    ps.stdin.end();
    ps.on('error', reject);
    ps.on('close', (code) => (code === 0 ? resolve() : reject(new Error('Set-Clipboard failed'))));
  });
}

/** Paste technician clipboard text into the active remote app. */
export async function pasteToRemoteClipboard(text: string): Promise<void> {
  await setRemoteClipboardText(text);
  await injectShortcut('v', ['Control']);
}
