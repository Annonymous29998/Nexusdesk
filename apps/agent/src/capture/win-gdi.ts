import { createLogger } from '../logger.js';
import type sharpFactory from 'sharp';
import type { RawFrame } from './encoder.js';

const log = createLogger('capture-gdi');

const SRCCOPY = 0x00cc0020;
const DIB_RGB_COLORS = 0;
const BI_RGB = 0;
const CURSOR_SHOWING = 0x00000001;
const DI_NORMAL = 0x0003;

type KoffiLib = {
  func: (sig: string) => (...args: never[]) => unknown;
};

function drawCursor(hdcMem: unknown, user32: KoffiLib, gdi32: KoffiLib): void {
  try {
    const GetCursorInfo = user32.func('bool GetCursorInfo(void * pci)') as (pci: Buffer) => boolean;
    const DrawIconEx = user32.func(
      'bool DrawIconEx(intptr hdc, int xLeft, int yTop, intptr hIcon, int cx, int cy, uint istepIfAniCur, intptr hbrFlickerFreeDraw, uint diFlags)',
    ) as (
      hdc: unknown,
      x: number,
      y: number,
      hIcon: bigint | number,
      cx: number,
      cy: number,
      istep: number,
      brush: number,
      flags: number,
    ) => boolean;
    const GetIconInfo = user32.func('bool GetIconInfo(intptr hIcon, void * piconinfo)') as (
      hIcon: bigint | number,
      info: Buffer,
    ) => boolean;
    const DeleteObject = gdi32.func('bool DeleteObject(intptr h)') as (
      h: bigint | number,
    ) => boolean;

    const ci = Buffer.alloc(24);
    ci.writeUInt32LE(24, 0);
    if (!GetCursorInfo(ci)) return;
    if ((ci.readUInt32LE(4) & CURSOR_SHOWING) === 0) return;
    const hCursor = process.arch === 'ia32' ? ci.readInt32LE(8) : ci.readBigInt64LE(8);
    const x = ci.readInt32LE(process.arch === 'ia32' ? 12 : 16);
    const y = ci.readInt32LE(process.arch === 'ia32' ? 16 : 20);
    if (!hCursor) return;

    let hotX = 0;
    let hotY = 0;
    const iconInfo = Buffer.alloc(process.arch === 'ia32' ? 20 : 32);
    if (GetIconInfo(hCursor, iconInfo)) {
      hotX = iconInfo.readUInt32LE(4);
      hotY = iconInfo.readUInt32LE(8);
      const mask = process.arch === 'ia32' ? iconInfo.readInt32LE(12) : iconInfo.readBigInt64LE(16);
      const color =
        process.arch === 'ia32' ? iconInfo.readInt32LE(16) : iconInfo.readBigInt64LE(24);
      if (mask) DeleteObject(mask);
      if (color) DeleteObject(color);
    }
    DrawIconEx(hdcMem, x - hotX, y - hotY, hCursor, 0, 0, 0, 0, DI_NORMAL);
  } catch {
    /* cursor overlay is best-effort — never fail the frame */
  }
}

type GdiApi = {
  captureRgba: (
    maxWidth: number,
  ) => Promise<{ width: number; height: number; data: Buffer } | null>;
};

let gdiApi: GdiApi | null = null;
let gdiFailed = false;
/** Reused across frames — a fresh 8 MB alloc + memset per frame costs more than the capture. */
let scratchPixels: Buffer | null = null;
let sharpModule: typeof sharpFactory | null = null;

function bgraToRgba(buf: Buffer): void {
  for (let i = 0; i < buf.length; i += 4) {
    const b = buf[i]!;
    buf[i] = buf[i + 2]!;
    buf[i + 2] = b;
  }
}

function scratchFor(bytes: number): Buffer {
  if (!scratchPixels || scratchPixels.length < bytes) {
    scratchPixels = Buffer.allocUnsafe(bytes);
  }
  return scratchPixels.length === bytes ? scratchPixels : scratchPixels.subarray(0, bytes);
}

async function loadSharp(): Promise<typeof sharpFactory | null> {
  if (sharpModule) return sharpModule;
  sharpModule = await import('sharp').then((m) => m.default).catch(() => null);
  return sharpModule;
}

async function loadGdiApi(): Promise<GdiApi | null> {
  if (gdiApi) return gdiApi;
  if (gdiFailed || process.platform !== 'win32') return null;

  try {
    const koffi = (await import('koffi')).default;
    const user32 = koffi.load('user32.dll');
    const gdi32 = koffi.load('gdi32.dll');

    const SetProcessDPIAware = user32.func('bool SetProcessDPIAware()');
    const GetDC = user32.func('intptr GetDC(intptr hwnd)');
    const ReleaseDC = user32.func('int ReleaseDC(intptr hwnd, intptr hdc)');
    const GetSystemMetrics = user32.func('int GetSystemMetrics(int nIndex)');

    const CreateCompatibleDC = gdi32.func('intptr CreateCompatibleDC(intptr hdc)');
    const CreateCompatibleBitmap = gdi32.func(
      'intptr CreateCompatibleBitmap(intptr hdc, int cx, int cy)',
    );
    const SelectObject = gdi32.func('intptr SelectObject(intptr hdc, intptr h)');
    const BitBlt = gdi32.func(
      'bool BitBlt(intptr hdcDest, int x, int y, int cx, int cy, intptr hdcSrc, int x1, int y1, uint32 rop)',
    );
    const DeleteDC = gdi32.func('bool DeleteDC(intptr hdc)');
    const DeleteObject = gdi32.func('bool DeleteObject(intptr h)');
    const GetDIBits = gdi32.func(
      'int GetDIBits(intptr hdc, intptr hbm, uint start, uint cLines, void * lpvBits, void * lpbi, uint usage)',
    );

    SetProcessDPIAware();

    gdiApi = {
      async captureRgba(
        maxWidth: number,
      ): Promise<{ width: number; height: number; data: Buffer } | null> {
        try {
          const hdcScreen = GetDC(0);
          if (!hdcScreen) return null;

          const width = Math.max(1, GetSystemMetrics(0));
          const height = Math.max(1, GetSystemMetrics(1));
          const hdcMem = CreateCompatibleDC(hdcScreen);
          const hBitmap = CreateCompatibleBitmap(hdcScreen, width, height);
          if (!hdcMem || !hBitmap) {
            if (hBitmap) DeleteObject(hBitmap);
            if (hdcMem) DeleteDC(hdcMem);
            ReleaseDC(0, hdcScreen);
            return null;
          }

          SelectObject(hdcMem, hBitmap);
          BitBlt(hdcMem, 0, 0, width, height, hdcScreen, 0, 0, SRCCOPY);
          drawCursor(hdcMem, user32, gdi32);

          const bmi = Buffer.alloc(40);
          bmi.writeUInt32LE(40, 0);
          bmi.writeInt32LE(width, 4);
          bmi.writeInt32LE(-height, 8);
          bmi.writeUInt16LE(1, 12);
          bmi.writeUInt16LE(32, 14);
          bmi.writeUInt32LE(BI_RGB, 16);

          const pixels = scratchFor(width * height * 4);
          const lines = GetDIBits(hdcMem, hBitmap, 0, height, pixels, bmi, DIB_RGB_COLORS);

          DeleteObject(hBitmap);
          DeleteDC(hdcMem);
          ReleaseDC(0, hdcScreen);

          if (!lines) return null;

          const sharp = await loadSharp();
          if (!sharp) return null;

          // Downscale while still BGRA (channel order does not affect resizing), then swap
          // channels on the much smaller result instead of the full-resolution frame.
          const out = await sharp(pixels, { raw: { width, height, channels: 4 } })
            .resize({ width: maxWidth, withoutEnlargement: true, fastShrinkOnLoad: true })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

          const rgba = Buffer.isBuffer(out.data) ? out.data : Buffer.from(out.data);
          bgraToRgba(rgba);

          return {
            width: out.info.width,
            height: out.info.height,
            data: rgba,
          };
        } catch (err) {
          log.warn({ err }, 'GDI frame capture failed');
          return null;
        }
      },
    };

    log.info('win32 GDI screen capture ready');
    return gdiApi;
  } catch (err) {
    gdiFailed = true;
    log.warn({ err }, 'win32 GDI capture unavailable');
    return null;
  }
}

/** Fast in-process Windows capture — raw RGBA for WebRTC (no JPEG round-trip). */
export async function captureViaGdi(maxWidth: number, _quality: number): Promise<RawFrame | null> {
  const api = await loadGdiApi();
  if (!api) return null;

  const frame = await api.captureRgba(maxWidth);
  if (!frame?.data.length) return null;

  return {
    width: frame.width,
    height: frame.height,
    format: 'rgba',
    data: frame.data,
    capturedAt: new Date().toISOString(),
  };
}
