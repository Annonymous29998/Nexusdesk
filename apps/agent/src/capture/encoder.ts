import { deflateSync } from 'node:zlib';

export interface RawFrame {
  width: number;
  height: number;
  format: 'rgba' | 'jpeg' | 'png';
  data: Buffer;
  capturedAt: string;
}

export async function compressFrame(frame: RawFrame, quality = 60): Promise<Buffer> {
  try {
    const sharp = await import('sharp').then((m) => m.default).catch(() => null);
    if (sharp && frame.format === 'rgba') {
      return sharp(frame.data, {
        raw: { width: frame.width, height: frame.height, channels: 4 },
      })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
    }
  } catch {
    // fall through
  }

  if (frame.format === 'jpeg' || frame.format === 'png') {
    return frame.data;
  }

  return deflateSync(frame.data);
}
