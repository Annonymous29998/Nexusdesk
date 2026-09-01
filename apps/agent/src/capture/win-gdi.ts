import { createLogger } from '../logger.js';
import { jpegDimensions } from './jpeg-utils.js';
import type { RawFrame } from './encoder.js';
import { syncPhysicalInputScreenSize } from './input.js';

const log = createLogger('capture-gdi');

const SRCCOPY = 0x00cc0020;
const DIB_RGB_COLORS = 0;
const BI_RGB = 0;

type GdiApi = {
  captureJpeg: (maxWidth: number, quality: number) => Promise<Buffer | null>;
};

let gdiApi: GdiApi | null = null;
let gdiFailed = false;

function bgraToRgba(buf: Buffer): void {
  for (let i = 0; i < buf.length; i += 4) {
    const b = buf[i]!;
    buf[i] = buf[i + 2]!;
    buf[i + 2] = b;
  }
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
      async captureJpeg(maxWidth: number, quality: number): Promise<Buffer | null> {
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

          const bmi = Buffer.alloc(40);
          bmi.writeUInt32LE(40, 0);
          bmi.writeInt32LE(width, 4);
          bmi.writeInt32LE(-height, 8);
          bmi.writeUInt16LE(1, 12);
          bmi.writeUInt16LE(32, 14);
          bmi.writeUInt32LE(BI_RGB, 16);

          const pixels = Buffer.alloc(width * height * 4);
          const lines = GetDIBits(hdcMem, hBitmap, 0, height, pixels, bmi, DIB_RGB_COLORS);

          DeleteObject(hBitmap);
          DeleteDC(hdcMem);
          ReleaseDC(0, hdcScreen);

          if (!lines) return null;

          bgraToRgba(pixels);

          const sharp = await import('sharp').then((m) => m.default).catch(() => null);
          if (!sharp) return null;

          return sharp(pixels, { raw: { width, height, channels: 4 } })
            .resize({ width: maxWidth, withoutEnlargement: true, fastShrinkOnLoad: true })
            .jpeg({ quality, mozjpeg: false })
            .toBuffer();
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

/** Fast in-process Windows capture — avoids spawning PowerShell each frame. */
export async function captureViaGdi(maxWidth: number, quality: number): Promise<RawFrame | null> {
  const api = await loadGdiApi();
  if (!api) return null;

  const data = await api.captureJpeg(maxWidth, quality);
  if (!data?.length) return null;

  await syncPhysicalInputScreenSize();
  const dims = jpegDimensions(data);
  if (!dims) return null;

  return {
    width: dims.width,
    height: dims.height,
    format: 'jpeg',
    data,
    capturedAt: new Date().toISOString(),
  };
}
