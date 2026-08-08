import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

function signingConfigured(): boolean {
  if (process.env.CODE_SIGN_PFX_PATH) return true;
  return Boolean(process.env.CODE_SIGN_CERT_PATH && process.env.CODE_SIGN_KEY_PATH);
}

/**
 * Authenticode-sign a completed Windows PE.
 * Must run AFTER guest config is appended — signing then appending invalidates the signature.
 * Returns the original buffer when signing is not configured (local/dev).
 * If signing is misconfigured, falls back to the unsigned EXE so downloads never break.
 */
export function signWindowsExeIfConfigured(exe: Buffer): Buffer {
  if (!signingConfigured()) return exe;

  const script = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../scripts/sign-windows-exe.sh',
  );
  const dir = mkdtempSync(path.join(tmpdir(), 'nd-sign-'));
  const input = path.join(dir, 'in.exe');
  const output = path.join(dir, 'out.exe');

  try {
    writeFileSync(input, exe);
    const result = spawnSync('bash', [script, input, output], {
      encoding: 'utf8',
      env: process.env,
    });
    if (result.status !== 0) {
      const detail = `${result.stderr || ''}${result.stdout || ''}`.trim();
      console.warn('[windows-exe-sign] signing failed; serving unsigned EXE:', detail || result.status);
      return exe;
    }
    return readFileSync(output);
  } catch (err) {
    console.warn('[windows-exe-sign] signing error; serving unsigned EXE:', err);
    return exe;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function isWindowsExeSigningEnabled(): boolean {
  return signingConfigured();
}
