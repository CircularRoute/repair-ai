// Icon generator: dark gradient background, large green wrench glyph with an
// AI spark accent. No wordmark: at home-screen sizes text is illegible, the
// app name is shown under the icon by the OS anyway.
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

// Four-point spark, the AI accent, drawn in a 24x24 box centered on (12,12).
const SPARK =
  'M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z';

// 512x512 master art. `pad` shrinks the glyph group toward the center so the
// same art works as a maskable icon (glyph must stay inside the inner 80%).
function makeSvg(pad = 0) {
  const scale = 1 - pad;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1a2129"/>
      <stop offset="1" stop-color="#0c1014"/>
    </linearGradient>
    <linearGradient id="wr" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4fc07e"/>
      <stop offset="1" stop-color="#329158"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <g transform="translate(256 264)">
      <g transform="translate(-138 -138) scale(11.5)">
        <path d="${WRENCH}" fill="url(#wr)"/>
      </g>
    </g>
    <g transform="translate(388 124)">
      <g transform="translate(-42 -42) scale(3.5)">
        <path d="${SPARK}" fill="#e8edf2"/>
      </g>
    </g>
  </g>
</svg>
`;
}

const FULL = makeSvg(0);
const MASKABLE = makeSvg(0.18);

for (const [name, size, svg] of [
  ['icon-512.png', 512, FULL],
  ['icon-192.png', 192, FULL],
  ['apple-touch-icon.png', 180, FULL],
  ['icon-maskable-512.png', 512, MASKABLE],
  ['icon-maskable-192.png', 192, MASKABLE],
]) {
  const png = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  writeFileSync(join(outDir, name), png);
  console.log('wrote', name);
}
