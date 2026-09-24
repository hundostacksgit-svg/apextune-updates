// Renders the Peregrine badge PNGs from the SVGs tools/logo/peregrine.py writes.
//   PW_CHROMIUM=/path/to/chromium node tools/logo/render.mjs
// Each line of SET is: svg name, png name, width, height, background (or transparent).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'studio', 'assets', 'logo');
const SET = [
  ['peregrine.svg', 'peregrine-1024.png', 1024, 1024, 'transparent'],
  ['peregrine.svg', 'peregrine-1024-dark.png', 1024, 1024, '#0b0712'],
  ['peregrine-plate.svg', 'peregrine-plate-1024.png', 1024, 1024, 'transparent'],
  ['peregrine-lockup.svg', 'peregrine-lockup-2880.png', 2880, 1024, '#0b0712'],
  ['peregrine-pfp.svg', 'peregrine-pfp-800.png', 800, 800, 'transparent'],
  ['peregrine-banner.svg', 'peregrine-banner-1500x500.png', 1500, 500, '#07050c'],
];
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
for (const [svgName, pngName, w, h, bg] of SET) {
  const svg = fs.readFileSync(path.join(dir, svgName), 'utf8');
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const body = bg === 'transparent' ? 'background:transparent' : `background:${bg}`;
  await page.setContent(`<html><body style="margin:0;${body};display:grid;place-items:center;width:${w}px;height:${h}px;overflow:hidden">${svg.replace('<svg ', `<svg style="width:${w}px;height:${h}px" `)}</body></html>`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(dir, pngName), omitBackground: bg === 'transparent' });
  await page.close();
  console.log('wrote', pngName);
}
await browser.close();
