// Icon generator: dark background, green wrench glyph, "Repair AI" wordmark.
// Rasterizes an inline SVG with sharp (dev dependency only; the PNGs are
// committed, production never needs sharp). Run: node tools/make-icons.mjs
// Wrench path is the Material Icons "build" glyph (Apache 2.0).

import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const WRENCH =
  'M22.7 19l-9.1-9.1c.9-2.3.4-5-1.5-6.9-2-2-5-2.4-7.4-1.3L9 6 6 9 1.6 4.7C.4 7.1.9 10.1 2.9 12.1c1.9 1.9 4.6 2.4 6.9 1.5l9.1 9.1c.4.4 1 .4 1.4 0l2.3-2.3c.5-.4.5-1.1.1-1.4z';

// 512x512 master art. The wrench sits in the upper middle, the wordmark below.
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#101418"/>
  <g transform="translate(256 208)">
    <g transform="translate(-105 -105) scale(8.75)">
      <path d="${WRENCH}" fill="#3fa66a"/>
    </g>
  </g>
  <text x="256" y="416" text-anchor="middle"
        font-family="Helvetica, Arial, sans-serif" font-weight="700"
        font-size="76" fill="#e8edf2">Repair AI</text>
</svg>
`;

for (const [name, size] of [
  ['icon-512.png', 512],
  ['icon-192.png', 192],
  ['apple-touch-icon.png', 180],
]) {
  const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  writeFileSync(join(outDir, name), png);
  console.log('wrote', name);
}
