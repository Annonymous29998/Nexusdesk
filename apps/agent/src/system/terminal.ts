import { spawn } from 'node:child_process';
import { createLogger } from '../logger.js';

const log = createLogger('terminal');

export async function runTerminalCommand(
  command: string,
  timeoutMs = 30_000,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      log.info({ code, command }, 'terminal command finished');
      resolve({ code, stdout, stderr });
    });
  });
}

export async function openPtyShell(): Promise<{ write: (data: string) => void; kill: () => void } | null> {
  try {
    const pty = await import('node-pty').then((m) => m).catch(() => null);
    if (!pty) return null;
    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash';
    const term = pty.spawn(shell, [], { name: 'xterm-color', cols: 120, rows: 40 });
    return {
      write: (data: string) => term.write(data),
      kill: () => term.kill(),
    };
  } catch {
    return null;
  }
}
