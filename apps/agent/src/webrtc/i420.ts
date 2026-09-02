/** Convert RGBA pixels to I420 (YUV420p) for WebRTC video frames. */

/**
 * Two rotating output buffers: the encoder reads the frame we just handed it,
 * so we never overwrite the buffer that is still in flight.
 */
const pool: Buffer[] = [];
let poolIndex = 0;

function outputBuffer(bytes: number): Buffer {
  const slot = poolIndex;
  poolIndex = (poolIndex + 1) % 2;
  const existing = pool[slot];
  if (existing && existing.length === bytes) return existing;
  const created = Buffer.allocUnsafe(bytes);
  pool[slot] = created;
  return created;
}

export function rgbaToI420(
  rgba: Buffer,
  srcWidth: number,
  srcHeight: number,
  outWidth = srcWidth,
  outHeight = srcHeight,
): Buffer {
  const ySize = outWidth * outHeight;
  const uvSize = (outWidth >> 1) * (outHeight >> 1);
  const out = outputBuffer(ySize + uvSize * 2);
  let yOff = 0;
  let uOff = ySize;
  let vOff = ySize + uvSize;

  // Fast path: no rescaling, so the per-pixel source index advances linearly.
  if (outWidth === srcWidth && outHeight === srcHeight) {
    let i = 0;
    for (let row = 0; row < outHeight; row += 1) {
      const evenRow = (row & 1) === 0;
      for (let col = 0; col < outWidth; col += 1, i += 4) {
        const r = rgba[i]!;
        const g = rgba[i + 1]!;
        const b = rgba[i + 2]!;
        out[yOff++] = clamp((77 * r + 150 * g + 29 * b) >> 8);
        if (evenRow && (col & 1) === 0) {
          out[uOff++] = clamp(((-43 * r - 85 * g + 128 * b) >> 8) + 128);
          out[vOff++] = clamp(((128 * r - 107 * g - 21 * b) >> 8) + 128);
        }
      }
    }
    return out;
  }

  for (let row = 0; row < outHeight; row += 1) {
    const srcRow = Math.min(srcHeight - 1, Math.floor((row * srcHeight) / outHeight));
    const rowOff = srcRow * srcWidth;
    const evenRow = (row & 1) === 0;
    for (let col = 0; col < outWidth; col += 1) {
      const srcCol = Math.min(srcWidth - 1, Math.floor((col * srcWidth) / outWidth));
      const i = (rowOff + srcCol) * 4;
      const r = rgba[i]!;
      const g = rgba[i + 1]!;
      const b = rgba[i + 2]!;
      out[yOff++] = clamp((77 * r + 150 * g + 29 * b) >> 8);

      if (evenRow && (col & 1) === 0) {
        out[uOff++] = clamp(((-43 * r - 85 * g + 128 * b) >> 8) + 128);
        out[vOff++] = clamp(((128 * r - 107 * g - 21 * b) >> 8) + 128);
      }
    }
  }

  return out;
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
