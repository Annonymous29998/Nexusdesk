#!/usr/bin/env node
/** Build branded PNG + ICO icons for guest installer desktop shortcuts. */
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const meeting = path.join(root, 'apps/dashboard/public/meeting');
const outDir = path.join(root, 'apps/api/assets/installer-icons');

const templates = [
  { id: 'zoom', src: path.join(meeting, 'zoom-favicon.svg') },
  { id: 'google_meet', src: path.join(meeting, 'meet-favicon.svg') },
  { id: 'adobe', src: path.join(root, 'apps/api/assets/installer-icons/document-viewer.svg') },
  { id: 'guest_list', src: path.join(meeting, 'guest-list-favicon.svg') },
];

await mkdir(outDir, { recursive: true });

for (const { id, src } of templates) {
  const pngOut = path.join(outDir, `${id}.png`);
  const icoOut = path.join(outDir, `${id}.ico`);
  const input = await readFile(src);
  const png = await sharp(input, { density: 300 })
    .resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp(png).toFile(pngOut);
  await sharp(png).resize(48, 48).toFile(icoOut);
  console.log(`Wrote ${path.basename(pngOut)} + ${path.basename(icoOut)}`);
}
