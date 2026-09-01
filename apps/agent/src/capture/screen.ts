import { execFile } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { RawFrame } from './encoder.js';
import si from 'systeminformation';
import { createLogger } from '../logger.js';
import { setInputScreenSize } from './input.js';

const log = createLogger('capture');
const execFileAsync = promisify(execFile);

let cachedSize: { width: number; height: number } | null = null;
let lastCaptureError: string | null = null;

export function getLastCaptureError(): string | null {
  return lastCaptureError;
}

/** Read width/height from a JPEG buffer (SOF0/SOF2). */
function jpegDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    if (marker === 0xd9 || marker === 0xda) return null;
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

async function primaryDisplaySize(): Promise<{ width: number; height: number }> {
  if (cachedSize) return cachedSize;
  try {
    const graphics = await si.graphics();
    const primary = graphics.displays.find((d) => d.main) ?? graphics.displays[0];
    cachedSize = {
      width: primary?.resolutionX ?? 1920,
      height: primary?.resolutionY ?? 1080,
    };
  } catch {
    cachedSize = { width: 1920, height: 1080 };
  }
  return cachedSize;
}

function frameFromJpeg(buf: Buffer, size: { width: number; height: number }): RawFrame {
  return {
    width: size.width,
    height: size.height,
    format: 'jpeg',
    data: buf,
    capturedAt: new Date().toISOString(),
  };
}

/** Reliable Windows capture via GDI (fallback when screenshot-desktop fails). */
async function captureViaPowerShell(maxWidth = 1280, jpegQuality = 52): Promise<RawFrame | null> {
  if (process.platform !== 'win32') return null;
  const out = join(tmpdir(), `nd-screen-${process.pid}-${Date.now()}.jpg`);
  const safeOut = out.replace(/'/g, "''");
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms,System.Drawing',
    '$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
    '$src = New-Object System.Drawing.Bitmap $b.Width, $b.Height',
    '$g = [System.Drawing.Graphics]::FromImage($src)',
    '$g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size)',
    '$g.Dispose()',
    `$maxW = ${maxWidth}`,
    '$outBmp = $src',
    'if ($b.Width -gt $maxW) {',
    '  $scale = $maxW / $b.Width',
    '  $nw = [int]($b.Width * $scale); $nh = [int]($b.Height * $scale)',
    '  $outBmp = New-Object System.Drawing.Bitmap $nw, $nh',
    '  $g2 = [System.Drawing.Graphics]::FromImage($outBmp)',
    '  $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighSpeedBilinear',
    '  $g2.DrawImage($src, 0, 0, $nw, $nh)',
    '  $g2.Dispose(); $src.Dispose()',
    '}',
    `$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }`,
    '$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)',
    `$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, ${jpegQuality})`,
    `$outBmp.Save('${safeOut}', $enc, $ep)`,
    '$outBmp.Dispose()',
  ].join('; ');

  try {
    await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-Command', script],
      { windowsHide: true, timeout: 20_000, maxBuffer: 4 * 1024 * 1024 },
    );
    const data = readFileSync(out);
    try {
      unlinkSync(out);
    } catch {
      /* ignore */
    }
    if (!data.length) return null;
    const jpegSize = jpegDimensions(data) ?? (await primaryDisplaySize());
    cachedSize = jpegSize;
    setInputScreenSize(jpegSize.width, jpegSize.height);
    lastCaptureError = null;
    return frameFromJpeg(data, jpegSize);
  } catch (err) {
    lastCaptureError = err instanceof Error ? err.message : String(err);
    try {
      unlinkSync(out);
    } catch {
      /* ignore */
    }
    return null;
  }
}

export async function captureScreenFrame(maxWidth = 1280, jpegQuality = 52): Promise<RawFrame> {
  try {
    const screenshot = await import('screenshot-desktop').then((m) => m.default).catch(() => null);
    if (screenshot) {
      const buf = (await screenshot({ format: 'jpg' })) as Buffer;
      if (buf?.length) {
        const jpegSize = jpegDimensions(buf);
        const size = jpegSize ?? (await primaryDisplaySize());
        if (jpegSize) cachedSize = jpegSize;
        setInputScreenSize(size.width, size.height);
        lastCaptureError = null;
        return frameFromJpeg(buf, size);
      }
    }
  } catch (err) {
    lastCaptureError = err instanceof Error ? err.message : String(err);
    log.warn({ err }, 'screenshot-desktop failed — trying PowerShell capture');
  }

  if (process.platform === 'win32') {
    const psFrame = await captureViaPowerShell(maxWidth, jpegQuality);
    if (psFrame) return psFrame;
  }

  log.warn({ err: lastCaptureError }, 'screen capture unavailable');
  const size = await primaryDisplaySize();
  return {
    width: size.width,
    height: size.height,
    format: 'rgba',
    data: Buffer.alloc(4),
    capturedAt: new Date().toISOString(),
  };
}
