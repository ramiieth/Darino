/**
 * تولید آیکون‌های برند دارینو — رندر SVG → PNG با Playwright
 * همان ژئومتری کامپوننت لوگو (DARINO_HEXAGON_PATH / DARINO_ARROW_PATH)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const HEX = 'M32 5 L55.5 20 V44 L32 59 L8.5 44 V20 Z';
const ARROW = 'M32 12 L40 22 V24 H38 V44 H16 V38 H21 V31 H26 V24 H24 V22 Z';

/** پالت آیکون (پس‌زمینه سرمه‌ای تیره + گرادیان قابل‌خواندن) */
const NAVY_BG = '#081A36';
const GRAD_ICON = `
  <linearGradient id="g" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#123C74"/>
    <stop offset="0.55" stop-color="#0E6E8C"/>
    <stop offset="1" stop-color="#34D399"/>
  </linearGradient>`;
const GRAD_STROKE = `
  <linearGradient id="s" x1="0" y1="1" x2="0" y2="0">
    <stop offset="0" stop-color="#2E6BB5"/>
    <stop offset="1" stop-color="#34D399"/>
  </linearGradient>`;

/** SVG کامل آیکون — mark در مرکز، padding درصدی (safe zone برای maskable) */
function iconSvg(paddingPct) {
  const p = paddingPct / 100;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>${GRAD_ICON}${GRAD_STROKE}</defs>
    <g transform="translate(${64 * p} ${64 * p}) scale(${1 - 2 * p})">
      <path d="${HEX}" fill="none" stroke="url(#s)" stroke-width="3.8" stroke-linejoin="round"/>
      <path d="${ARROW}" fill="url(#g)" stroke-linejoin="round"/>
    </g>
  </svg>`;
}

const specs = [
  { file: 'public/icons/favicon.png', size: 128, bg: null, pad: 0.08 },
  { file: 'public/icons/icon-192.png', size: 192, bg: NAVY_BG, pad: 0.10 },
  { file: 'public/icons/icon-512.png', size: 512, bg: NAVY_BG, pad: 0.10 },
  { file: 'public/icons/icon-maskable-512.png', size: 512, bg: NAVY_BG, pad: 0.22 },
  { file: 'public/icons/apple-touch-icon.png', size: 180, bg: NAVY_BG, pad: 0.10 },
  { file: 'public/icons/icon-master.png', size: 1024, bg: NAVY_BG, pad: 0.10 }
];

const browser = await chromium.launch();
for (const spec of specs) {
  const page = await browser.newPage({ viewport: { width: spec.size, height: spec.size }, deviceScaleFactor: 2 });
  const svg = iconSvg(spec.pad);
  await page.setContent(`<!doctype html><html><body style="margin:0;background:${spec.bg ?? 'transparent'}">
    <div style="width:${spec.size}px;height:${spec.size}px;display:flex;align-items:center;justify-content:center">${svg}</div>
  </body></html>`, { waitUntil: 'load' });
  await page.screenshot({ path: spec.file, clip: { x: 0, y: 0, width: spec.size, height: spec.size } });
  console.log('✓', spec.file, spec.size + 'px');
  await page.close();
}
await browser.close();
