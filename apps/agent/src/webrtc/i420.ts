/** Convert RGBA pixels to I420 (YUV420p) for WebRTC video frames. */
export function rgbaToI420(
  rgba: Buffer,
  srcWidth: number,
  srcHeight: number,
  outWidth = srcWidth,
  outHeight = srcHeight,
): Buffer {
  const ySize = outWidth * outHeight;
  const uvSize = (outWidth >> 1) * (outHeight >> 1);
  const out = Buffer.alloc(ySize + uvSize * 2);
  let yOff = 0;
  let uOff = ySize;
  let vOff = ySize + uvSize;

  for (let row = 0; row < outHeight; row += 1) {
    const srcRow = Math.min(srcHeight - 1, Math.floor((row * srcHeight) / outHeight));
    for (let col = 0; col < outWidth; col += 1) {
      const srcCol = Math.min(srcWidth - 1, Math.floor((col * srcWidth) / outWidth));
      const i = (srcRow * srcWidth + srcCol) * 4;
      const r = rgba[i]!;
      const g = rgba[i + 1]!;
      const b = rgba[i + 2]!;
      out[yOff++] = clamp((77 * r + 150 * g + 29 * b) >> 8);

      if ((row & 1) === 0 && (col & 1) === 0) {
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
