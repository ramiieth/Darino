/**
 * تولید آیکون‌های برند دارینو — رندر SVG → PNG با Playwright
 * همان ژئومتری کامپوننت لوگو (src/shared/components/brand/DarinoLogo.tsx)
 *
 * اجرا: node scripts/generate-brand-icons.mjs
 * (از Chrome نصب‌شده استفاده می‌کند؛ نیازی به دانلود Chromium نیست)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const GRADIENT = `<linearGradient id="t" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#3D6BFF"/><stop offset="1" stop-color="#1837B0"/>
  </linearGradient>`;
const GLYPH = `
    <rect x="14" y="37" width="7" height="12" rx="2.5" fill="#fff" opacity=".55"/>
    <rect x="24" y="27" width="7" height="22" rx="2.5" fill="#fff" opacity=".8"/>
    <path d="M34 15 A17 17 0 0 1 34 49 Z" fill="#fff"/>`;

/**
 * @param {'tile'|'bleed'} shape  tile = rounded square with transparent corners (favicon, "any" icons)
 *                                bleed = full-bleed square (OS applies its own mask: maskable, iOS)
 * @param {number} glyphScale     shrink the glyph toward the centre (maskable safe zone = 80% circle)
 */
function iconSvg(shape, glyphScale = 1) {
  const bg =
    shape === 'tile'
      ? '<rect width="64" height="64" rx="16" fill="url(#t)"/>'
      : '<rect width="64" height="64" fill="url(#t)"/>';
  const o = 32 * (1 - glyphScale);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="100%" height="100%"><defs>${GRADIENT}</defs>${bg}<g transform="translate(${o} ${o}) scale(${glyphScale})">${GLYPH}</g></svg>`;
}

// Vector favicon (crisp at every DPR); PNG favicon remains as fallback
fs.writeFileSync('public/icons/favicon.svg', iconSvg('tile').replace(' width="100%" height="100%"', '') + '\n');
console.log('✓ public/icons/favicon.svg');

const specs = [
  { file: 'public/icons/favicon.png', size: 64, shape: 'tile' },
  { file: 'public/icons/icon-192.png', size: 192, shape: 'tile' },
  { file: 'public/icons/icon-512.png', size: 512, shape: 'tile' },
  { file: 'public/icons/icon-maskable-512.png', size: 512, shape: 'bleed', scale: 0.8 },
  { file: 'public/icons/apple-touch-icon.png', size: 180, shape: 'bleed' },
  { file: 'public/icons/icon-master.png', size: 1024, shape: 'tile' }
];

const browser = await chromium.launch({ channel: 'chrome' });
for (const spec of specs) {
  const page = await browser.newPage({ viewport: { width: spec.size, height: spec.size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">
      <div style="width:${spec.size}px;height:${spec.size}px;line-height:0">${iconSvg(spec.shape, spec.scale)}</div>
    </body></html>`,
    { waitUntil: 'load' }
  );
  await page.screenshot({
    path: spec.file,
    omitBackground: true,
    clip: { x: 0, y: 0, width: spec.size, height: spec.size }
  });
  console.log('✓', spec.file, spec.size + 'px');
  await page.close();
}
await browser.close();
